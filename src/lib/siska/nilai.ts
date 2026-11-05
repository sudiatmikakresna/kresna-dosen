import 'server-only';
import { siska, SiskaError } from './client';

export type Ujian = 'UTS' | 'UAS';

const path = (k: number) => `/dosen/kelas-kuliah/${k}/nilai`;

/**
 * Halaman nilai SISKA mengunci kolom ujian untuk mahasiswa yang belum eligible, kecuali
 * nilainya sudah terisi atau dosen boleh override. Mengembalikan alasannya, atau null.
 */
function alasanTerkunci(m: any, c: any, bolehOverride: boolean): string | null {
  if (!c.exam_type || m[`eligible_${c.exam_type}`] !== false || bolehOverride) return null;
  const sekarang = m.grades?.[c.id];
  if (sekarang != null && parseFloat(sekarang) !== 0) return null;
  return m[`blocking_${c.exam_type}`] || `Belum eligible ${String(c.exam_type).toUpperCase()}`;
}

export async function getNilai(k: number) {
  const d = (await siska().page(path(k))).initialData;
  const singkat = Object.fromEntries(d.leaf_components.map((c: any) => [c.id, c.nama_singkat]));
  return {
    mata_kuliah: d.nama_mata_kuliah as string,
    kelas: d.nama_kelas as string,
    periode: d.periode as string,
    input_dibuka: !!d.is_input_nilai_dibuka,
    dikunci: !!d.is_nilai_dikunci,
    diumumkan: !!d.is_nilai_diumumkan,
    komponen: d.leaf_components.map((c: any) => ({
      nama: c.nama,
      singkatan: c.nama_singkat,
      bobot: c.bobot_efektif,
      dari_presensi: !!c.is_presensi,
      jenis_ujian: c.exam_type ? String(c.exam_type).toUpperCase() : null,
    })),
    mahasiswa: d.grade_matrix.map((m: any) => ({
      nim: String(m.nim),
      nama: m.nama_mahasiswa as string,
      nilai: Object.fromEntries(Object.entries(m.grades ?? {}).map(([id, v]) => [singkat[id] ?? id, v])),
      nilai_akhir: m.nilai_angka,
      huruf: m.nilai_huruf,
      eligible_uts: m.eligible_uts,
      eligible_uas: m.eligible_uas,
      alasan_tidak_eligible_uts: m.blocking_uts || null,
      alasan_tidak_eligible_uas: m.blocking_uas || null,
    })),
  };
}

/**
 * Simpan nilai UTS atau UAS. `isi` berupa nilai per mahasiswa, atau `semua` untuk nilai yang
 * sama ke seluruh kelas. Mahasiswa yang kolomnya terkunci dilewati dan dilaporkan. Hasilnya
 * dibaca ulang dari SISKA, karena pesan berhasil saja tidak membuktikan apa yang tersimpan.
 */
export async function simpanNilaiUjian(
  k: number,
  ujian: Ujian,
  isi: { nilai?: { nim: string; nilai: number | null }[]; semua?: number | null },
) {
  if ((isi.nilai === undefined) === (isi.semua === undefined)) {
    throw new SiskaError('Isi salah satu: nilai atau nilai_semua.');
  }
  const d = (await siska().page(path(k))).initialData;
  if (d.is_nilai_dikunci) throw new SiskaError('Nilai kelas ini sudah dikunci.');
  if (!d.is_input_nilai_dibuka) throw new SiskaError('Periode input nilai belum dibuka untuk kelas ini.');

  const komp = d.leaf_components.filter((c: any) => c.exam_type === ujian.toLowerCase());
  if (komp.length !== 1) throw new SiskaError(`Kelas ini punya ${komp.length} komponen ${ujian}, harus tepat satu.`);

  const byNim = new Map<string, any>(d.grade_matrix.map((m: any) => [String(m.nim), m]));
  const daftar: { mhs: any; nilai: number | null }[] = isi.nilai
    ? isi.nilai.map((n) => {
        const mhs = byNim.get(n.nim.trim());
        if (!mhs) throw new SiskaError(`NIM ${n.nim} tidak ada di kelas ini.`);
        return { mhs, nilai: n.nilai };
      })
    : d.grade_matrix.map((mhs: any) => ({ mhs, nilai: isi.semua as number | null }));

  const dilewati: { nim: string; nama: string; alasan: string }[] = [];
  const grades: { id_peserta_kelas: number; id_komposisi_nilai_kelas: number; nilai: number | null }[] = [];
  for (const { mhs, nilai } of daftar) {
    const alasan = alasanTerkunci(mhs, komp[0], !!d.can_override_eligibility);
    if (alasan) dilewati.push({ nim: String(mhs.nim), nama: mhs.nama_mahasiswa, alasan });
    else grades.push({ id_peserta_kelas: mhs.id_peserta_kelas, id_komposisi_nilai_kelas: komp[0].id, nilai });
  }
  if (grades.length === 0) return { ujian, jumlah: 0, pesan: 'Tidak ada nilai yang bisa disimpan.', dilewati };

  const res = await siska().json<any>('POST', path(k), { grades });
  const sesudah = await siska().json<any>('GET', `${path(k)}/data`);
  const byPeserta = new Map<number, any>(sesudah.grade_matrix.map((m: any) => [m.id_peserta_kelas, m]));
  const meleset = grades.filter((g) => {
    const v = byPeserta.get(g.id_peserta_kelas)?.grades?.[g.id_komposisi_nilai_kelas];
    return g.nilai === null ? v != null : v == null || parseFloat(v) !== g.nilai;
  });
  if (meleset.length > 0) {
    const nim = meleset.map((g) => byPeserta.get(g.id_peserta_kelas)?.nim ?? g.id_peserta_kelas).join(', ');
    throw new SiskaError(`SISKA menjawab berhasil, tetapi ${meleset.length} nilai berbeda saat dibaca ulang: ${nim}.`);
  }
  return { ujian, jumlah: grades.length, pesan: (res.message as string) ?? 'Nilai berhasil disimpan.', dilewati };
}
