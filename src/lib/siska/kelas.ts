import 'server-only';
import { siska } from './client';

const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null);

export type Kelas = {
  id: number;
  kodeMk: string;
  mataKuliah: string;
  sks: number;
  namaKelas: string;
  kelompok: string | null;
  prodi: string | null;
  jadwal: string | null;
  jumlahPeserta: number;
};

export async function listKelas(): Promise<Kelas[]> {
  const index = await siska().page('/dosen/kelas-kuliah');
  const periode = index.defaultPeriode?.value;
  const q = new URLSearchParams({ page: '1', per_page: '100', ...(periode ? { id_ref_akademik: String(periode) } : {}) });
  const d = await siska().json<any>('GET', `/dosen/kelas-kuliah/datatable?${q}`);
  return d.data.map((k: any) => ({
    id: k.id_kelas_kuliah,
    kodeMk: k.mata_kuliah?.kode_mata_kuliah,
    mataKuliah: k.mata_kuliah?.nama_mata_kuliah_ind,
    sks: k.mata_kuliah?.total_sks,
    namaKelas: k.nama_kelas,
    kelompok: k.ref_kelas_kelompok?.nama_kelas_kelompok ?? null,
    prodi: k.ref_prodi?.nama_prodi ?? null,
    jadwal: strip(k.jadwal_display),
    jumlahPeserta: k.jumlah_peserta,
  }));
}

export type Pertemuan = {
  id: number;
  ke: number;
  tanggal: string;
  hari: string;
  jam: string;
  ruang: string | null;
  status: 'TERJADWAL' | 'MULAI' | 'SELESAI' | 'DIGANTI' | string;
  jenis: string | null;
};

export async function getKelas(k: number) {
  const p = await siska().page(`/dosen/kelas-kuliah/${k}/pertemuan`);
  const d = p.initialData;
  return {
    id: d.id_kelas_kuliah as number,
    mataKuliah: d.nama_mata_kuliah as string,
    kodeMk: d.kode_mata_kuliah as string,
    namaKelas: d.nama_kelas as string,
    periode: d.periode as string,
    jumlahPeserta: d.jumlah_peserta as number,
    pertemuan: (d.pertemuan as any[]).map((x): Pertemuan => ({
      id: x.id_kelas_kuliah_pertemuan,
      ke: x.pertemuan_ke,
      tanggal: x.tanggal,
      hari: x.hari,
      jam: `${x.waktu_mulai?.slice(0, 5) ?? '-'}–${x.waktu_selesai?.slice(0, 5) ?? '-'}`,
      ruang: x.ruang_kuliah,
      status: x.status,
      jenis: x.jenis_pertemuan,
    })),
  };
}

export async function mulaiSesi(pertemuanId: number) {
  await siska().inertiaPost(`/dosen/dashboard/pertemuan/${pertemuanId}/mulai`, {});
}

const tanggalWita = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());

/** Jadwal mengajar pada satu tanggal (YYYY-MM-DD, bawaan hari ini WITA), dari dashboard dosen SISKA. */
export async function jadwalTanggal(tanggal = tanggalWita()) {
  const d = await siska().json<any[]>('GET', `/dosen/dashboard/jadwal?date=${encodeURIComponent(tanggal)}`);
  return d.map((x) => {
    const kk = x.kelas_kuliah ?? {};
    return {
      kelasId: x.id_kelas_kuliah as number,
      pertemuanId: x.id_kelas_kuliah_pertemuan as number,
      mataKuliah: (kk.mata_kuliah?.nama_mata_kuliah_ind ?? null) as string | null,
      kelas: (kk.ref_kelas_kelompok?.nama_kelas_kelompok ?? kk.nama_kelas ?? null) as string | null,
      pertemuanKe: x.pertemuan_ke as number,
      jam: x.waktu_mulai ? `${String(x.waktu_mulai).slice(0, 5)}–${String(x.waktu_selesai ?? '').slice(0, 5)}` : null,
      ruang: (x.ruang_kuliah ?? null) as string | null,
      status: x.status as string,
    };
  });
}
