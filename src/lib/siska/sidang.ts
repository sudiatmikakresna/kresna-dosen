import 'server-only';
import { SiskaError, siska } from './client';
import { semuaBaris, teks, type JenisKarya } from './bimbingan';

/**
 * Persetujuan sidang (proposal / skripsi / karya terapan) di SISKA, menu Tugas Akhir → Persetujuan Sidang.
 * Rute dan payload diambil dari halaman dosen SISKA (PersetujuanSidangPembimbingIndex):
 * - daftar: datatable `/dosen/persetujuan-sidang/datatable` (filter `id_ref_jenis_ka` 1=Skripsi 2=Karya Terapan,
 *   `id_periode_mulai`, `status_disetujui` = disetujui | belum; balasan `{ data, total }`). Hanya memuat mahasiswa
 *   bimbingan yang masih terdaftar di kelas bimbingan periode berjalan.
 * - setujui: Inertia POST `/dosen/persetujuan-sidang/bulk-approve` dengan `{ ids: [id_karya_akhir_dosen, ...] }`
 *   (sama dengan tombol centang "Setujui" per baris dan "Setujui Terpilih").
 * - detail: halaman `/dosen/{skripsi|karya-terapan}/{id_karya_akhir}/persetujuan-sidang` (props statusProposal /
 *   statusTugasAkhir berisi slot pembimbing 1, pembimbing 2, dan kaprodi).
 */

const PREFIX: Record<JenisKarya, string> = { karya_terapan: '/dosen/karya-terapan', skripsi: '/dosen/skripsi' };
const ID_JENIS: Record<JenisKarya, string> = { skripsi: '1', karya_terapan: '2' };
const PERAN: Record<string, string> = { pembimbing_1: 'Pembimbing I', pembimbing_2: 'Pembimbing II', kaprodi: 'Kaprodi' };

export type StatusSidang = 'belum' | 'disetujui' | 'semua';

export type PersetujuanSidang = {
  id_karya_akhir_dosen: number;
  id_karya_akhir: number;
  jenis: JenisKarya;
  jenis_label: string;
  nim: string;
  nama: string;
  fase: string;
  judul: string;
  disetujui_saya: boolean;
  lengkap: boolean;
};

/** Checklist persetujuan sidang mahasiswa bimbingan dosen ini. Bawaan: yang belum disetujui dosen. */
export async function daftarPersetujuanSidang(opsi: { status?: StatusSidang; jenis?: JenisKarya; cari?: string } = {}): Promise<PersetujuanSidang[]> {
  const status = opsi.status ?? 'belum';
  const filter: Record<string, string> = {};
  if (status !== 'semua') filter.status_disetujui = status;
  if (opsi.jenis) filter.id_ref_jenis_ka = ID_JENIS[opsi.jenis];
  const baris = await semuaBaris('/dosen/persetujuan-sidang/datatable', filter);
  const cari = opsi.cari?.toLowerCase().trim();
  return baris
    .map((r) => {
      const jenis: JenisKarya = Number(r.id_ref_jenis_ka) === 2 ? 'karya_terapan' : 'skripsi';
      return {
        id_karya_akhir_dosen: Number(r.id_karya_akhir_dosen),
        id_karya_akhir: Number(r.id_karya_akhir),
        jenis,
        jenis_label: teks(r.jenis_karya_label) || (jenis === 'skripsi' ? 'Skripsi' : 'Karya Terapan'),
        nim: String(r.nim ?? ''),
        nama: teks(r.nama_mahasiswa),
        fase: teks(r.fase_label) || '-',
        judul: teks(r.judul).slice(0, 300),
        disetujui_saya: r.is_disetujui_saya === true || r.is_disetujui_saya == 1,
        lengkap: r.is_lengkap === true || r.is_lengkap == 1,
      };
    })
    .filter((s) => !cari || s.nim.includes(cari) || s.nama.toLowerCase().includes(cari));
}

type Slot = { peran: string; id_dosen: number; nama: string; is_disetujui: boolean; is_stale: boolean; tanggal_disetujui: string | null };

const ringkasSlot = (st: { slots?: Slot[]; is_lengkap?: boolean } | null | undefined) =>
  st
    ? {
        lengkap: !!st.is_lengkap,
        persetujuan: (st.slots ?? []).map((s) => ({
          peran: PERAN[s.peran] ?? s.peran,
          dosen: teks(s.nama),
          disetujui: !!s.is_disetujui,
          perlu_persetujuan_ulang: !!s.is_stale,
          tanggal_disetujui: s.tanggal_disetujui,
        })),
      }
    : null;

/** Status persetujuan sidang satu mahasiswa: siapa saja (pembimbing I/II, kaprodi) yang sudah menyetujui. */
export async function detailPersetujuanSidang(jenis: JenisKarya, idKaryaAkhir: number) {
  const p = await siska().page(`${PREFIX[jenis]}/${idKaryaAkhir}/persetujuan-sidang`);
  const d = p.initialData;
  if (!d) throw new SiskaError(`Persetujuan sidang karya akhir ${idKaryaAkhir} tidak ditemukan.`);
  return {
    id_karya_akhir: idKaryaAkhir,
    jenis: jenis === 'skripsi' ? 'Skripsi' : 'Karya Terapan',
    nim: String(d.mahasiswa?.nim ?? ''),
    nama: teks(d.mahasiswa?.nama_mahasiswa),
    tahapan: p.isFaseTugasAkhir ? (jenis === 'skripsi' ? 'Skripsi' : 'Karya Terapan') : 'Proposal',
    tahap_detail: teks(d.ref_tahap_k_a?.nama),
    status: teks(d.ref_status_k_a?.status),
    judul: teks(d.judul).slice(0, 300),
    sidang_proposal: ringkasSlot(p.statusProposal),
    sidang_akhir: ringkasSlot(p.statusTugasAkhir),
  };
}

/**
 * Setujui sidang (seperti tombol "Setujui" di checklist). Hanya id_karya_akhir_dosen yang ada di checklist dosen
 * ini dan belum disetujui yang dikirim; hasilnya dibaca ulang untuk memastikan statusnya berubah.
 */
export async function setujuiSidang(ids: number[]) {
  const sebelum = await daftarPersetujuanSidang({ status: 'semua' });
  const peta = new Map(sebelum.map((s) => [s.id_karya_akhir_dosen, s]));
  const unik = [...new Set(ids)];
  const tidakDikenal = unik.filter((id) => !peta.has(id));
  if (tidakDikenal.length) throw new SiskaError(`id_karya_akhir_dosen ${tidakDikenal.join(', ')} tidak ada di checklist persetujuan sidang Anda.`);
  const kirim = unik.filter((id) => !peta.get(id)!.disetujui_saya);
  if (kirim.length) await siska().inertiaPost('/dosen/persetujuan-sidang/bulk-approve', { ids: kirim });
  const sesudah = new Map((await daftarPersetujuanSidang({ status: 'semua' })).map((s) => [s.id_karya_akhir_dosen, s]));
  const info = (id: number) => {
    const s = sesudah.get(id) ?? peta.get(id)!;
    return { id_karya_akhir_dosen: id, nim: s.nim, nama: s.nama, jenis: s.jenis_label, fase: s.fase, status_keseluruhan: s.lengkap ? 'Lengkap' : 'Belum Lengkap' };
  };
  return {
    disetujui: kirim.filter((id) => sesudah.get(id)?.disetujui_saya).map(info),
    sudah_disetujui_sebelumnya: unik.filter((id) => peta.get(id)!.disetujui_saya).map(info),
    gagal: kirim.filter((id) => !sesudah.get(id)?.disetujui_saya).map(info),
  };
}
