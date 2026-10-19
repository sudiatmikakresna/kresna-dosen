import 'server-only';
import { SiskaError, siska } from './client';

/**
 * Persetujuan bimbingan karya akhir di SISKA (menu Tingkat Akhir → Daftar Skripsi / Daftar Karya Terapan → Bimbingan).
 * Rute dan payload diambil dari halaman dosen SISKA (BimbinganShowlistPage): tabel memakai endpoint datatable
 * (`page`, `per_page`, filter tambahan; balasan `{ data, total }`) dan tombol "Setujui Terpilih" mengirim
 * Inertia POST `bulk-approve` dengan `{ ids: [id_bimbingan, ...] }`.
 */

export type JenisKarya = 'karya_terapan' | 'skripsi';
const PREFIX: Record<JenisKarya, string> = { karya_terapan: '/dosen/karya-terapan', skripsi: '/dosen/skripsi' };
const MAKS_BARIS = 500;

const teks = (v: unknown) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
const fase = (nama: unknown, jenis: JenisKarya) => (nama === 'Tugas Akhir' ? (jenis === 'skripsi' ? 'Skripsi' : 'Karya Terapan') : teks(nama) || '-');

/** Ambil semua baris datatable SISKA (berhalaman 100) sampai `total` atau MAKS_BARIS. */
async function semuaBaris(path: string, filter: Record<string, string>) {
  const hasil: Record<string, any>[] = [];
  for (let page = 1; page <= Math.ceil(MAKS_BARIS / 100); page++) {
    const q = new URLSearchParams({ page: String(page), per_page: '100', search: '', ...filter });
    const r = await siska().json<{ data?: Record<string, any>[]; total?: number }>('GET', `${path}?${q}`);
    const data = r.data ?? [];
    hasil.push(...data);
    if (data.length < 100 || hasil.length >= (r.total ?? 0)) break;
  }
  return hasil;
}

export type KaryaAkhir = {
  id_karya_akhir: number;
  nim: string;
  nama: string;
  tahapan: string;
  tahap_detail: string;
  status: string;
  judul: string;
  pembimbing: string[];
};

/** Mahasiswa karya akhir yang dibimbing dosen ini (peran pembimbing), opsional dicari nama/NIM dan hanya status Aktif. */
export async function daftarKaryaAkhir(jenis: JenisKarya, opsi: { cari?: string; hanyaAktif?: boolean } = {}): Promise<KaryaAkhir[]> {
  const baris = await semuaBaris(`${PREFIX[jenis]}/datatable`, { role_dosen: 'DOSEN_PEMBIMBING' });
  const cari = opsi.cari?.toLowerCase().trim();
  return baris
    .map((r) => ({
      id_karya_akhir: Number(r.id_karya_akhir),
      nim: String(r.mahasiswa?.nim ?? ''),
      nama: teks(r.mahasiswa?.nama_mahasiswa) || teks(r.mahasiswa?.nama_nim),
      tahapan: fase(r.ref_fase_pengajuan?.nama, jenis),
      tahap_detail: teks(r.ref_tahap_k_a?.nama),
      status: teks(r.ref_status_k_a?.status),
      judul: teks(r.jenis_judul ?? r.judul).slice(0, 300),
      pembimbing: Array.isArray(r.dosenPembimbing)
        ? r.dosenPembimbing.map((d: Record<string, any>) => `${d.pivot?.urutan_dosen ?? ''}. ${teks(d.nama_dosen)}`.trim())
        : [],
    }))
    .filter((k) => (opsi.hanyaAktif === false ? true : k.status === 'Aktif'))
    .filter((k) => !cari || k.nim.includes(cari) || k.nama.toLowerCase().includes(cari));
}

export type Bimbingan = {
  id_bimbingan: number;
  bimbingan_ke: number | null;
  tanggal: string;
  fase: string;
  topik: string;
  dosen: string;
  disetujui: boolean;
  sumber: 'jadwal kelas bimbingan' | 'diajukan';
};

/** Catatan bimbingan satu karya akhir; status 'belum' = yang belum disetujui. */
export async function daftarBimbingan(jenis: JenisKarya, idKaryaAkhir: number, status: 'belum' | 'disetujui' | 'semua' = 'belum'): Promise<Bimbingan[]> {
  const baris = await semuaBaris(`${PREFIX[jenis]}/${idKaryaAkhir}/bimbingan/datatable`, status === 'semua' ? {} : { status_disetujui: status });
  return baris.map((r) => ({
    id_bimbingan: Number(r.id_bimbingan),
    bimbingan_ke: r.bimbingan_ke == null ? null : Number(r.bimbingan_ke),
    tanggal: teks(r.tanggal_bimbingan).slice(0, 10),
    fase: fase(r.ref_fase_pengajuan?.nama, jenis),
    topik: teks(r.topik_bimbingan).slice(0, 500),
    dosen: teks(r.dosen?.nama_lengkap),
    disetujui: r.is_disetujui == 1 || r.is_disetujui === true,
    sumber: r.is_jadwal_otomatis ? 'jadwal kelas bimbingan' : 'diajukan',
  }));
}

/**
 * Setujui catatan bimbingan (seperti tombol "Setujui Terpilih"). Hanya id yang memang milik karya akhir ini dan
 * belum disetujui yang dikirim; hasilnya dibaca ulang untuk memastikan statusnya berubah.
 */
export async function setujuiBimbingan(jenis: JenisKarya, idKaryaAkhir: number, ids: number[]) {
  const sebelum = await daftarBimbingan(jenis, idKaryaAkhir, 'semua');
  const peta = new Map(sebelum.map((b) => [b.id_bimbingan, b]));
  const tidakDikenal = ids.filter((id) => !peta.has(id));
  if (tidakDikenal.length) throw new SiskaError(`id_bimbingan ${tidakDikenal.join(', ')} bukan milik karya akhir ${idKaryaAkhir}.`);
  const kirim = [...new Set(ids)].filter((id) => !peta.get(id)!.disetujui);
  if (kirim.length) await siska().inertiaPost(`${PREFIX[jenis]}/${idKaryaAkhir}/bimbingan/bulk-approve`, { ids: kirim });
  const sesudah = new Map((await daftarBimbingan(jenis, idKaryaAkhir, 'semua')).map((b) => [b.id_bimbingan, b]));
  return {
    disetujui: kirim.filter((id) => sesudah.get(id)?.disetujui),
    sudah_disetujui_sebelumnya: ids.filter((id) => peta.get(id)!.disetujui),
    gagal: kirim.filter((id) => !sesudah.get(id)?.disetujui),
  };
}
