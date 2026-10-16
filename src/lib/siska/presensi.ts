import 'server-only';
import { siska, SiskaError } from './client';

export const STATUS = { H: 2, S: 4, I: 3, A: 1 } as const;
export const KODE: Record<number, 'H' | 'S' | 'I' | 'A'> = { 2: 'H', 4: 'S', 3: 'I', 1: 'A' };

export type Peserta = {
  id_peserta_kelas: number;
  nim: string;
  nama: string;
  status: 'H' | 'S' | 'I' | 'A' | null;
  keterangan: string | null;
  terkunci: boolean;
};

const path = (k: number, p: number) => `/dosen/kelas-kuliah/${k}/presensi/${p}`;

const wita = () =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .format(new Date());

export async function getPresensi(k: number, p: number) {
  const d = await siska().json<any>('GET', path(k, p));
  const peserta: Peserta[] = d.peserta.map((x: any) => ({
    id_peserta_kelas: x.id_peserta_kelas,
    nim: String(x.nim),
    nama: x.nama_mahasiswa,
    status: KODE[x.id_ref_status_hadir] ?? null,
    keterangan: x.keterangan,
    terkunci: !!x.disabled,
  }));
  return { pertemuanKe: d.pertemuan?.pertemuan_ke as number | undefined, peserta };
}

/**
 * Mark one student as present. SISKA accepts a partial list (only the students sent are
 * updated), so parallel scans do not overwrite each other.
 */
export async function markHadir(k: number, p: number, nim: string, via = 'QR Presensi') {
  const { peserta } = await getPresensi(k, p);
  const m = peserta.find((x) => x.nim === nim.trim());
  if (!m) throw new SiskaError('NIM tidak terdaftar di kelas ini.');
  return markHadirPeserta(k, p, m, via);
}

/**
 * Sama dengan markHadir, tetapi pesertanya sudah dicari lebih dulu. Dipakai
 * halaman /absen, yang memang harus membaca daftar peserta untuk tahu kuliah
 * mana yang diikuti NIM tersebut, jadi tidak perlu membacanya dua kali.
 */
export async function markHadirPeserta(k: number, p: number, m: Peserta, via = 'QR Presensi') {
  if (m.status === 'H') return { mahasiswa: m, sudah: true };
  if (m.terkunci) throw new SiskaError('Presensi Anda terkunci. Hubungi dosen.');
  // Izin dan Sakit diisi dosen atas permintaan mahasiswa. Scan QR atau unggah bukti
  // tidak boleh menimpanya menjadi Hadir.
  if (m.status === 'I' || m.status === 'S') {
    throw new SiskaError(`Status Anda sudah ${m.status === 'I' ? 'Izin' : 'Sakit'}. Hubungi dosen jika salah.`);
  }
  const res = await siska().json<any>('POST', path(k, p), {
    peserta: [{ id_peserta_kelas: m.id_peserta_kelas, id_ref_status_hadir: STATUS.H, keterangan: `${via} ${wita()} WITA` }],
  });
  if (!res.success) throw new SiskaError(res.message || 'Gagal menyimpan presensi.');
  return { mahasiswa: m, sudah: false };
}

/** Tutup presensi: setiap mahasiswa yang belum punya status menjadi Alfa. */
export async function tutupPresensi(k: number, p: number) {
  const { peserta } = await getPresensi(k, p);
  const kosong = peserta.filter((x) => x.status === null && !x.terkunci);
  if (kosong.length) {
    const res = await siska().json<any>('POST', path(k, p), {
      peserta: kosong.map((x) => ({
        id_peserta_kelas: x.id_peserta_kelas,
        id_ref_status_hadir: STATUS.A,
        keterangan: `Tidak scan QR (ditutup ${wita()} WITA)`,
      })),
    });
    if (!res.success) throw new SiskaError(res.message || 'Gagal menutup presensi.');
  }
  return kosong.length;
}

export type Perubahan = { nim: string; status: 'H' | 'S' | 'I' | 'A'; keterangan?: string };

/**
 * Ubah status beberapa mahasiswa sekaligus atas nama dosen (boleh menimpa Izin/Sakit). Hanya peserta yang
 * dikirim yang berubah. NIM yang tidak terdaftar atau presensinya terkunci dilaporkan, tidak dikirim.
 */
export async function ubahPresensi(k: number, p: number, perubahan: Perubahan[]) {
  const { peserta } = await getPresensi(k, p);
  const peta = new Map(peserta.map((x) => [x.nim, x]));
  const kirim: { id_peserta_kelas: number; id_ref_status_hadir: number; keterangan: string }[] = [];
  const ditolak: { nim: string; alasan: string }[] = [];
  for (const u of perubahan) {
    const m = peta.get(u.nim.trim());
    if (!m) ditolak.push({ nim: u.nim, alasan: 'NIM tidak terdaftar di kelas ini' });
    else if (m.terkunci) ditolak.push({ nim: u.nim, alasan: 'presensi terkunci di SISKA' });
    else kirim.push({ id_peserta_kelas: m.id_peserta_kelas, id_ref_status_hadir: STATUS[u.status], keterangan: u.keterangan ?? `Diubah dosen ${wita()} WITA` });
  }
  if (kirim.length) {
    const res = await siska().json<any>('POST', path(k, p), { peserta: kirim });
    if (!res.success) throw new SiskaError(res.message || 'Gagal menyimpan presensi.');
  }
  return { diubah: kirim.length, ditolak };
}
