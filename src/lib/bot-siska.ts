import 'server-only';
import { eq } from 'drizzle-orm';
import { db, waGrup } from '@/db';
import { siskaSiap } from './siska/client';
import { getKelas, jadwalTanggal, listKelas, type Kelas } from './siska/kelas';
import { getPresensi } from './siska/presensi';

/**
 * Tool SISKA untuk bot WhatsApp, HANYA membaca: jadwal mengajar, presensi satu pertemuan, dan rekap
 * ketidakhadiran per kelas. Bot tidak pernah mengubah presensi atau memulai/menutup sesi; itu tetap lewat
 * konektor MCP SISKA atau web SISKA.
 *
 * Kelas dikenali dari nama grup WhatsApp yang mengikuti pola HARI-DOSEN-Mata Kuliah-PRODI-KELAS-JAM,
 * mis. "KAM-IBK-Pemrograman Mobile-SI-PAGI1-13.00" → Pemrograman Mobile, Sistem Informasi, PAGI1.
 */

export { siskaSiap };

const LABEL = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alfa' } as const;
const PRODI: Record<string, string> = { IF: 'teknikinformatika', TI: 'teknikinformatika', SI: 'sisteminformasi' };

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const akronim = (s: string | null | undefined) =>
  (s ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toLowerCase();
const labelKelas = (k: Kelas) => `${k.mataKuliah} ${k.namaKelas}${k.prodi ? ` (${k.prodi})` : ''}`;

/** Kelas SISKA yang cocok dengan nama grup berpola HARI-DOSEN-Mata Kuliah-PRODI-KELAS-JAM. */
export function cocokNamaGrup(nama: string, semua: Kelas[]) {
  const b = nama.split('-').map((s) => s.trim());
  if (b.length < 6) return [];
  const kelas = b[b.length - 2];
  const prodi = PRODI[b[b.length - 3].toUpperCase()];
  const mk = b.slice(2, b.length - 3).join('-');
  return semua.filter(
    (k) => norm(k.mataKuliah) === norm(mk) && norm(k.namaKelas) === norm(kelas) && (!prodi || norm(k.prodi) === prodi),
  );
}

/** Kelas dari teks bebas ("spk", "pemrograman mobile si pagi1", "4702", "kamis") atau dari grup tempat bertanya. */
export async function cariKelas(teks: string | undefined, chatId: string): Promise<Kelas[]> {
  const semua = await listKelas();
  const t = (teks ?? '').toLowerCase().trim();
  if (!t) {
    const [g] = await db().select({ nama: waGrup.nama }).from(waGrup).where(eq(waGrup.chatId, chatId)).limit(1);
    return g?.nama ? cocokNamaGrup(g.nama, semua) : [];
  }
  return saringKelas(t, semua);
}

/** Kelas yang cocok dengan teks bebas: id kelas, atau semua kata ada di nama, singkatan, prodi, atau jadwal. */
export function saringKelas(teks: string, semua: Kelas[]) {
  const t = teks.toLowerCase().trim();
  const byId = semua.filter((k) => String(k.id) === t);
  if (byId.length) return byId;
  const kata = t.split(/\s+/).filter(Boolean);
  return semua.filter((k) => {
    const prodiPendek = norm(k.prodi) === 'teknikinformatika' ? 'ti if' : norm(k.prodi) === 'sisteminformasi' ? 'si' : '';
    const indeks = `${k.mataKuliah} ${akronim(k.mataKuliah)} ${k.namaKelas} ${k.kelompok ?? ''} ${k.prodi ?? ''} ${prodiPendek} ${k.jadwal ?? ''}`.toLowerCase();
    const token = new Set(indeks.split(/[^a-z0-9]+/).filter(Boolean));
    return kata.every((w) => token.has(w) || (w.length > 3 && indeks.includes(w)));
  });
}

export async function perluKelas(cocok: Kelas[]) {
  const pilihan = cocok.length ? cocok : await listKelas();
  return {
    hasil: 'perlu_kelas',
    pesan: cocok.length ? 'Lebih dari satu kelas cocok, sebutkan lebih spesifik.' : 'Kelas tidak dikenali dari grup ini. Sebutkan kelasnya.',
    pilihan: pilihan.map(labelKelas),
  };
}

const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());

/** Jadwal mengajar dosen pada satu tanggal. */
export async function jadwalSiska(tanggal?: string) {
  const tgl = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : hariIni();
  const jadwal = await jadwalTanggal(tgl);
  return {
    sumber: 'SISKA',
    tanggal: tgl,
    pertemuan: jadwal.map((j) => ({ mataKuliah: j.mataKuliah, kelas: j.kelas, pertemuanKe: j.pertemuanKe, jam: j.jam, ruang: j.ruang, status: j.status })),
  };
}

/** Presensi satu pertemuan. Bawaan: pertemuan terakhir yang sudah dimulai atau selesai. */
export async function presensiSiska(f: { kelas?: string; pertemuanKe?: number }, chatId: string) {
  const kelas = await cariKelas(f.kelas, chatId);
  if (kelas.length !== 1) return perluKelas(kelas);
  const k = await getKelas(kelas[0].id);
  const berjalan = k.pertemuan.filter((p) => p.status === 'MULAI' || p.status === 'SELESAI');
  const p = f.pertemuanKe
    ? k.pertemuan.find((x) => x.ke === f.pertemuanKe)
    : berjalan.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.ke - b.ke).at(-1);
  if (!p) return { hasil: 'tidak_ada', pesan: f.pertemuanKe ? `Pertemuan ke-${f.pertemuanKe} tidak ada.` : 'Belum ada pertemuan yang dimulai.' };
  if (p.status !== 'MULAI' && p.status !== 'SELESAI') {
    return { hasil: 'belum_dimulai', pesan: `Pertemuan ke-${p.ke} (${p.tanggal}) masih berstatus ${p.status}, presensinya belum ada.` };
  }
  const { peserta } = await getPresensi(k.id, p.id);
  const daftar = (s: keyof typeof LABEL | null) => peserta.filter((x) => x.status === s).map((x) => `${x.nama} (${x.nim})`);
  return {
    sumber: 'SISKA',
    kelas: `${k.mataKuliah} ${k.namaKelas}`,
    pertemuan: { ke: p.ke, tanggal: p.tanggal, hari: p.hari, jam: p.jam, status: p.status },
    rekap: {
      Hadir: daftar('H').length,
      Sakit: daftar('S').length,
      Izin: daftar('I').length,
      Alfa: daftar('A').length,
      'Belum diisi': daftar(null).length,
    },
    Alfa: daftar('A'),
    Izin: daftar('I'),
    Sakit: daftar('S'),
    'Belum diisi': daftar(null),
    Hadir: daftar('H'),
  };
}

/** Mahasiswa yang Alfa + Izin sebanyak `minimal` kali atau lebih, dihitung dari pertemuan berstatus SELESAI. */
export async function rekapKetidakhadiranSiska(f: { kelas?: string; minimal?: number }, chatId: string) {
  const kelas = await cariKelas(f.kelas, chatId);
  if (kelas.length !== 1) return perluKelas(kelas);
  const minimal = Number.isInteger(f.minimal) && f.minimal! >= 1 && f.minimal! <= 16 ? f.minimal! : 3;
  const k = await getKelas(kelas[0].id);
  const selesai = k.pertemuan.filter((p) => p.status === 'SELESAI').sort((a, b) => a.ke - b.ke);

  // Presensi diambil per pertemuan; dibatasi 4 sekaligus supaya SISKA tidak dibanjiri.
  const hasil: Awaited<ReturnType<typeof getPresensi>>[] = [];
  for (let i = 0; i < selesai.length; i += 4) {
    hasil.push(...(await Promise.all(selesai.slice(i, i + 4).map((p) => getPresensi(k.id, p.id)))));
  }

  const orang = new Map<string, { nama: string; Alfa: number[]; Izin: number[]; Sakit: number[]; kosong: number[] }>();
  hasil.forEach(({ peserta }, i) => {
    const ke = selesai[i].ke;
    for (const x of peserta) {
      const o = orang.get(x.nim) ?? { nama: x.nama, Alfa: [], Izin: [], Sakit: [], kosong: [] };
      if (x.status === 'A') o.Alfa.push(ke);
      else if (x.status === 'I') o.Izin.push(ke);
      else if (x.status === 'S') o.Sakit.push(ke);
      else if (x.status === null) o.kosong.push(ke);
      orang.set(x.nim, o);
    }
  });
  const daftar = [...orang.entries()]
    .map(([nim, o]) => ({ nim, ...o, total: o.Alfa.length + o.Izin.length }))
    .sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));
  return {
    sumber: 'SISKA',
    kelas: `${k.mataKuliah} ${k.namaKelas}`,
    pertemuanSelesai: selesai.map((p) => p.ke),
    aturan: `Alfa + Izin ${minimal} kali atau lebih. Sakit tidak dihitung. "kosong" = status belum diisi di pertemuan itu.`,
    memenuhi: daftar
      .filter((d) => d.total >= minimal)
      .map((d) => ({ nim: d.nim, nama: d.nama, alfaPertemuanKe: d.Alfa, izinPertemuanKe: d.Izin, total: d.total })),
    hampir: daftar
      .filter((d) => d.total === minimal - 1)
      .map((d) => ({ nim: d.nim, nama: d.nama, alfa: d.Alfa.length, izin: d.Izin.length })),
    statusKosong: daftar.filter((d) => d.kosong.length).map((d) => ({ nama: d.nama, pertemuanKe: d.kosong })),
  };
}
