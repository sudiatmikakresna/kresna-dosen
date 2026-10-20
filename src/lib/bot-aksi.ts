import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { berkas, botAksi, db, revisi, users } from '@/db';
import { catatAktivitas, kirimRevisi } from './service';
import { JENIS, labelJenisPendek, terpisah } from './labels';
import { AMBANG_PERSEN, rekapPerbaikan } from './perbaikan';
import { teksPengumuman } from './review-ai';
import { kirimKeGrup } from './wa-laporan';
import { cariKelas, perluKelas } from './bot-siska';
import { getKelas, mulaiSesi, type Pertemuan } from './siska/kelas';
import { getPresensi, ubahPresensi, type Peserta } from './siska/presensi';
import { daftarBimbingan, daftarKaryaAkhir, setujuiBimbingan, type JenisKarya, type KaryaAkhir } from './siska/bimbingan';
import { daftarPersetujuanSidang, setujuiSidang } from './siska/sidang';

/**
 * Absensi SISKA lewat bot WhatsApp, dengan konfirmasi dua langkah:
 *   1. Dosen meminta ("@bot absen hadir Rifqi"). Claude memanggil tool rencana_*; kode di sini mencocokkan
 *      kelas, pertemuan, dan mahasiswa, lalu menyimpan RENCANA di bot_aksi. Belum ada yang berubah di SISKA.
 *   2. Bot mengirim ringkasan rencana (teks dari kode ini, bukan dari Claude). Dosen membalas "ya".
 *      Yang dijalankan persis isi rencana, sekali, sebelum kedaluwarsa. Claude tidak ikut di langkah ini.
 * Persetujuan bimbingan skripsi/karya terapan memakai alur yang sama (rencana_setujui_bimbingan_siska → "ya"),
 * begitu juga persetujuan sidang, kirim revisi, dan setujui bab di kresna-dosen.
 * Semua tool rencana dalam SATU pesan dikumpulkan menjadi satu rencana gabungan (simpanRencanaGabungan); satu "ya"
 * menjalankan semua langkah berurutan.
 * Menutup presensi (Alfa massal) dan mengakhiri sesi sengaja tidak tersedia.
 */

const MENIT_BERLAKU = 10;
const LABEL = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alfa' } as const;
type Kode = keyof typeof LABEL;

const KATA_YA = new Set(['ya', 'y', 'iya', 'ok', 'oke', 'okay', 'simpan', 'lanjut', 'setuju']);
const KATA_BATAL = new Set(['batal', 'tidak', 'jangan', 'ga', 'gak', 'nggak', 'no', 'cancel']);

type DataUbah = {
  kelasId: number;
  pertemuanId: number;
  kelas: string;
  pertemuanKe: number;
  perubahan: { nim: string; nama: string; status: Kode; keterangan?: string }[];
};
type DataMulai = { kelasId: number; pertemuanId: number; kelas: string; pertemuanKe: number };
type DataJudul = { userId: number; nim: string; nama: string; judulLama: string | null; judulBaru: string };
type DataSetuju = {
  jenis: JenisKarya;
  idKaryaAkhir: number;
  nim: string;
  nama: string;
  bimbingan: { id: number; ke: number | null; tanggal: string; topik: string }[];
};

type DataKirimRevisi = {
  berkasId: number;
  mahasiswaId: number;
  nama: string;
  label: string;
  keputusan: 'perlu_revisi' | 'disetujui';
  ringkasan?: string;
  umumkan: boolean;
};
type DataSidang = {
  mahasiswa: { id: number; nim: string; nama: string; jenis: string; fase: string }[];
};

/** `pratinjau`: halaman Uji bot; rencana disusun untuk dilihat tetapi tidak pernah disimpan atau dijalankan. */
export type Konteks = { chatId: string; pengirimId: string | null; bolehMengubah: boolean; pratinjau?: boolean };

const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
const kata = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

/** Satu peserta yang cocok dengan NIM (penuh atau akhiran) atau semua kata nama; selain itu daftar kandidat. */
export function cocokPeserta<T extends Pick<Peserta, 'nim' | 'nama'>>(cari: string, peserta: T[]): T[] {
  const c = cari.trim();
  const digit = c.replace(/\D/g, '');
  if (digit.length >= 4 && digit.length === c.replace(/\s/g, '').length) {
    return peserta.filter((p) => p.nim === digit || p.nim.endsWith(digit));
  }
  const k = kata(c);
  if (k.length === 0) return [];
  return peserta.filter((p) => {
    const n = kata(p.nama);
    return k.every((w) => n.some((x) => x === w || (w.length >= 3 && x.startsWith(w))));
  });
}

/**
 * Satu langkah rencana. Tool rencana_* tidak lagi menyimpan rencana sendiri: setiap tool mengembalikan satu langkah,
 * lalu bot-wa mengumpulkan semua langkah dari satu pesan menjadi SATU rencana gabungan (simpanRencanaGabungan),
 * sehingga dosen cukup membalas "ya" sekali dan ringkasan yang dikirim selalu sama dengan yang dijalankan.
 */
export type JenisLangkah = 'ubah_presensi' | 'mulai_sesi' | 'setujui_bimbingan' | 'ubah_judul' | 'setujui_sidang' | 'kirim_revisi';
export type Langkah = { jenis: JenisLangkah; data: unknown; ringkasan: string };
type DataGabungan = { langkah: Langkah[] };

export const MAKS_LANGKAH = 10;

function simpanRencana(_ctx: Konteks, jenis: JenisLangkah, data: unknown, ringkasan: string) {
  return {
    hasil: 'langkah_dicatat' as const,
    langkah: { jenis, data, ringkasan } satisfies Langkah,
    ringkasan,
    pesan: 'Langkah dicatat ke rencana (belum dijalankan). Lanjutkan permintaan lain bila ada; sistem akan mengirim satu ringkasan untuk dikonfirmasi dosen.',
  };
}

const kunciLangkah = (l: Langkah) => `${l.jenis}:${JSON.stringify(l.data)}`;

/** Gabungkan ringkasan langkah: satu langkah tetap seperti biasa, beberapa langkah diberi nomor. */
function ringkasanGabungan(langkah: Langkah[]) {
  if (langkah.length === 1) return langkah[0].ringkasan;
  return [
    `📝 *Rencana gabungan: ${langkah.length} langkah*`,
    ...langkah.map((l, i) => l.ringkasan.replace(/^📝\s*/, `*${i + 1}.* `)),
  ].join('\n\n');
}

/**
 * Simpan semua langkah dari satu pesan sebagai satu rencana yang menunggu "ya". Langkah ganda (jenis dan data sama)
 * dibuang. `pratinjau` (halaman Uji bot) hanya menyusun ringkasan tanpa menyimpan apa pun.
 */
export async function simpanRencanaGabungan(ctx: Konteks, semua: Langkah[]) {
  const unik = [...new Map(semua.map((l) => [kunciLangkah(l), l])).values()].slice(0, MAKS_LANGKAH);
  const ringkasan = ringkasanGabungan(unik);
  if (ctx.pratinjau || !ctx.pengirimId) {
    return `${ringkasan}\n\n_(Uji bot: rencana hanya pratinjau, tidak disimpan dan tidak bisa dijalankan.)_`;
  }
  // Satu rencana aktif per dosen per grup: rencana lama yang belum dikonfirmasi diganti.
  await db()
    .update(botAksi)
    .set({ status: 'dibatalkan', hasil: 'Diganti rencana baru.', selesaiAt: new Date() })
    .where(and(eq(botAksi.chatId, ctx.chatId), eq(botAksi.pengirimId, ctx.pengirimId), eq(botAksi.status, 'menunggu')));
  await db()
    .insert(botAksi)
    .values({
      chatId: ctx.chatId,
      pengirimId: ctx.pengirimId,
      jenis: unik.length === 1 ? unik[0].jenis : 'gabungan',
      data: unik.length === 1 ? unik[0].data : ({ langkah: unik } satisfies DataGabungan),
      ringkasan,
      kedaluwarsaAt: new Date(Date.now() + MENIT_BERLAKU * 60_000),
    });
  const sisa = semua.length > MAKS_LANGKAH ? `\n\n⚠️ Hanya ${MAKS_LANGKAH} langkah pertama yang dimasukkan.` : '';
  return `${ringkasan}${sisa}\n\nBalas pesan ini dengan *ya* dalam ${MENIT_BERLAKU} menit untuk menjalankan ${unik.length > 1 ? 'semua langkah' : 'rencana ini'}, atau *batal*.`;
}

function tolakBila(ctx: Konteks) {
  if (ctx.pratinjau) return null;
  if (!ctx.bolehMengubah) {
    return { hasil: 'error', pesan: 'Mengubah data lewat bot hanya aktif bila daftar nomor yang diizinkan di halaman bot diisi.' };
  }
  if (!ctx.pengirimId) return { hasil: 'error', pesan: 'Pengirim tidak dikenali, rencana tidak bisa dibuat.' };
  return null;
}

/** Pertemuan untuk presensi: ke-N bila disebut, selain itu yang sedang MULAI, lalu yang SELESAI terakhir. */
function pilihPertemuanPresensi(semua: Pertemuan[], ke?: number) {
  if (ke) return semua.find((p) => p.ke === ke);
  const urut = [...semua].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.ke - b.ke);
  return urut.filter((p) => p.status === 'MULAI').at(-1) ?? urut.filter((p) => p.status === 'SELESAI').at(-1);
}

/** Tool: rencana mengubah presensi beberapa mahasiswa pada satu pertemuan. */
export async function rencanaUbahPresensi(
  f: { kelas?: string; pertemuanKe?: number; perubahan: { mahasiswa: string; status: string; keterangan?: string }[] },
  ctx: Konteks,
) {
  const tolak = tolakBila(ctx);
  if (tolak) return tolak;
  if (!f.perubahan.length) return { hasil: 'error', pesan: 'Sebutkan mahasiswa dan statusnya.' };

  const kelas = await cariKelas(f.kelas, ctx.chatId);
  if (kelas.length !== 1) return perluKelas(kelas);
  const k = await getKelas(kelas[0].id);
  const p = pilihPertemuanPresensi(k.pertemuan, f.pertemuanKe);
  if (!p) return { hasil: 'error', pesan: f.pertemuanKe ? `Pertemuan ke-${f.pertemuanKe} tidak ada.` : 'Belum ada pertemuan yang dimulai di kelas ini.' };
  if (p.status !== 'MULAI' && p.status !== 'SELESAI') {
    return { hasil: 'error', pesan: `Pertemuan ke-${p.ke} (${p.tanggal}) masih ${p.status}. Mulai sesinya dulu.` };
  }
  const { peserta } = await getPresensi(k.id, p.id);

  const masalah: string[] = [];
  const peta = new Map<string, DataUbah['perubahan'][number] & { lama: Kode | null }>();
  for (const u of f.perubahan.slice(0, 40)) {
    const status = u.status.toUpperCase() as Kode;
    if (!(status in LABEL)) {
      masalah.push(`Status "${u.status}" untuk ${u.mahasiswa} tidak dikenal (pakai Hadir, Sakit, Izin, atau Alfa).`);
      continue;
    }
    const cocok = cocokPeserta(u.mahasiswa, peserta);
    if (cocok.length === 0) masalah.push(`"${u.mahasiswa}" tidak ada di peserta kelas ini.`);
    else if (cocok.length > 1) masalah.push(`"${u.mahasiswa}" cocok dengan beberapa mahasiswa: ${cocok.map((m) => `${m.nama} (${m.nim})`).join(', ')}.`);
    else if (cocok[0].terkunci) masalah.push(`Presensi ${cocok[0].nama} terkunci di SISKA.`);
    else peta.set(cocok[0].nim, { nim: cocok[0].nim, nama: cocok[0].nama, status, lama: cocok[0].status, keterangan: u.keterangan?.slice(0, 200) });
  }
  // Rencana hanya dibuat bila SEMUA nama jelas, supaya dosen tidak mengonfirmasi daftar yang setengah benar.
  if (masalah.length) return { hasil: 'perlu_perbaikan', masalah, saran: 'Tanyakan ke dosen nama lengkap atau NIM yang dimaksud.' };

  const berubah = [...peta.values()].filter((x) => x.lama !== x.status);
  const sama = [...peta.values()].filter((x) => x.lama === x.status);
  if (berubah.length === 0) {
    return { hasil: 'tidak_ada_perubahan', pesan: `Semua yang disebut sudah berstatus seperti yang diminta di pertemuan ke-${p.ke}.` };
  }
  const label = (s: Kode | null) => (s ? LABEL[s] : 'kosong');
  const ringkasan = [
    '📝 *Rencana presensi SISKA*',
    `${k.mataKuliah} ${k.namaKelas}, pertemuan ke-${p.ke} (${p.hari}, ${p.tanggal})`,
    ...berubah.map((x) => `- ${x.nim} ${x.nama}: ${label(x.lama)} → *${LABEL[x.status]}*${x.keterangan ? ` (${x.keterangan})` : ''}`),
    ...(sama.length ? [`_Sudah sesuai, tidak diubah: ${sama.map((x) => x.nama).join(', ')}_`] : []),
  ].join('\n');
  const data: DataUbah = {
    kelasId: k.id,
    pertemuanId: p.id,
    kelas: `${k.mataKuliah} ${k.namaKelas}`,
    pertemuanKe: p.ke,
    perubahan: berubah.map(({ lama: _, ...x }) => x),
  };
  return simpanRencana(ctx, 'ubah_presensi', data, ringkasan);
}

/** Tool: rencana memulai sesi pertemuan yang masih TERJADWAL (bawaan: pertemuan hari ini). */
export async function rencanaMulaiSesi(f: { kelas?: string; pertemuanKe?: number }, ctx: Konteks) {
  const tolak = tolakBila(ctx);
  if (tolak) return tolak;
  const kelas = await cariKelas(f.kelas, ctx.chatId);
  if (kelas.length !== 1) return perluKelas(kelas);
  const k = await getKelas(kelas[0].id);
  const hari = hariIni();
  const p = f.pertemuanKe ? k.pertemuan.find((x) => x.ke === f.pertemuanKe) : k.pertemuan.find((x) => x.tanggal === hari);
  if (!p) {
    const berikut = k.pertemuan.filter((x) => x.status === 'TERJADWAL').sort((a, b) => a.tanggal.localeCompare(b.tanggal))[0];
    return {
      hasil: 'error',
      pesan: f.pertemuanKe ? `Pertemuan ke-${f.pertemuanKe} tidak ada.` : `Tidak ada pertemuan ${k.mataKuliah} ${k.namaKelas} hari ini.`,
      pertemuanTerjadwalBerikutnya: berikut ? `ke-${berikut.ke}, ${berikut.hari} ${berikut.tanggal}` : null,
    };
  }
  if (p.status !== 'TERJADWAL') return { hasil: 'error', pesan: `Pertemuan ke-${p.ke} (${p.tanggal}) sudah berstatus ${p.status}.` };
  const ringkasan = [
    '📝 *Rencana mulai sesi SISKA*',
    `${k.mataKuliah} ${k.namaKelas}, pertemuan ke-${p.ke} (${p.hari}, ${p.tanggal}, ${p.jam})`,
    'Status akan berubah dari TERJADWAL menjadi MULAI. SISKA mencatat jam mulai saat ini.',
  ].join('\n');
  return simpanRencana(ctx, 'mulai_sesi', { kelasId: k.id, pertemuanId: p.id, kelas: `${k.mataKuliah} ${k.namaKelas}`, pertemuanKe: p.ke }, ringkasan);
}

const LABEL_JENIS: Record<JenisKarya, string> = { karya_terapan: 'Karya Terapan', skripsi: 'Skripsi' };

/** Mahasiswa bimbingan karya akhir (karya terapan dan/atau skripsi) yang cocok dengan nama atau NIM. */
export async function cariMahasiswaKaryaAkhir(cari: string, jenis?: JenisKarya) {
  const daftar = (
    await Promise.all(
      (jenis ? [jenis] : (['karya_terapan', 'skripsi'] as JenisKarya[])).map(async (j) => (await daftarKaryaAkhir(j)).map((k) => ({ ...k, jenis: j }))),
    )
  ).flat();
  return { semua: daftar, cocok: cocokPeserta(cari, daftar) };
}

/**
 * Tool: rencana menyetujui bimbingan karya akhir satu mahasiswa di SISKA. Bawaan semua bimbingan yang belum
 * disetujui; bila `bimbinganKe` diisi, hanya nomor itu.
 */
export async function rencanaSetujuiBimbingan(f: { mahasiswa: string; jenis?: JenisKarya; bimbinganKe?: number[] }, ctx: Konteks) {
  const tolak = tolakBila(ctx);
  if (tolak) return tolak;
  const { cocok } = await cariMahasiswaKaryaAkhir(f.mahasiswa, f.jenis);
  if (cocok.length !== 1) {
    return {
      hasil: 'perlu_perbaikan',
      pesan: cocok.length === 0 ? `Tidak ada mahasiswa bimbingan aktif yang cocok dengan "${f.mahasiswa}".` : `Ada ${cocok.length} mahasiswa yang cocok; minta nama lengkap atau NIM.`,
      kandidat: cocok.slice(0, 10).map((k: KaryaAkhir & { jenis: JenisKarya }) => `${k.nama} (${k.nim}, ${LABEL_JENIS[k.jenis]})`),
    };
  }
  const k = cocok[0];
  const belum = await daftarBimbingan(k.jenis, k.id_karya_akhir, 'belum');
  const dipilih = f.bimbinganKe?.length ? belum.filter((b) => b.bimbingan_ke != null && f.bimbinganKe!.includes(b.bimbingan_ke)) : belum;
  if (dipilih.length === 0) {
    return {
      hasil: 'perlu_perbaikan',
      pesan: belum.length === 0 ? `Semua bimbingan ${k.nama} di SISKA sudah disetujui.` : `Bimbingan ke-${f.bimbinganKe!.join(', ')} tidak ada di antara yang belum disetujui.`,
      belumDisetujui: belum.map((b) => `ke-${b.bimbingan_ke}: ${b.tanggal}, ${b.topik.slice(0, 80)}`),
    };
  }
  const ringkasan = [
    '📝 *Rencana setujui bimbingan di SISKA*',
    `${k.nama} (${k.nim}) · ${LABEL_JENIS[k.jenis]}`,
    ...dipilih.map((b) => `- Bimbingan ke-${b.bimbingan_ke ?? '?'}, ${b.tanggal}: ${b.topik.slice(0, 100) || '(tanpa topik)'}`),
    'Persetujuan di SISKA tidak bisa dibatalkan dari bot.',
  ].join('\n');
  const data: DataSetuju = {
    jenis: k.jenis,
    idKaryaAkhir: k.id_karya_akhir,
    nim: k.nim,
    nama: k.nama,
    bimbingan: dipilih.map((b) => ({ id: b.id_bimbingan, ke: b.bimbingan_ke, tanggal: b.tanggal, topik: b.topik.slice(0, 100) })),
  };
  return simpanRencana(ctx, 'setujui_bimbingan', data, ringkasan);
}

/**
 * Tool: rencana menyetujui sidang di SISKA (Tugas Akhir → Persetujuan Sidang) untuk mahasiswa yang disebut, atau
 * semua yang masih menunggu persetujuan dosen bila `semua` = true. Rencana hanya dibuat bila SEMUA nama jelas.
 */
export async function rencanaSetujuiSidang(f: { mahasiswa?: string[]; semua?: boolean }, ctx: Konteks) {
  const tolak = tolakBila(ctx);
  if (tolak) return tolak;
  const nama = (f.mahasiswa ?? []).map((m) => m.trim()).filter(Boolean).slice(0, 30);
  if (!f.semua && nama.length === 0) return { hasil: 'perlu_perbaikan', pesan: 'Sebutkan mahasiswa yang akan disetujui sidangnya, atau minta "semua".' };

  const checklist = await daftarPersetujuanSidang({ status: 'semua' });
  const menunggu = checklist.filter((s) => !s.disetujui_saya);
  const masalah: string[] = [];
  const sudah: string[] = [];
  const dipilih = new Map<number, (typeof checklist)[number]>();
  if (f.semua) {
    for (const s of menunggu) dipilih.set(s.id_karya_akhir_dosen, s);
  } else {
    for (const n of nama) {
      const cocok = cocokPeserta(n, checklist);
      if (cocok.length === 0) masalah.push(`"${n}" tidak ada di checklist persetujuan sidang.`);
      else if (cocok.length > 1) masalah.push(`"${n}" cocok dengan beberapa mahasiswa: ${cocok.map((m) => `${m.nama} (${m.nim})`).join(', ')}.`);
      else if (cocok[0].disetujui_saya) sudah.push(cocok[0].nama);
      else dipilih.set(cocok[0].id_karya_akhir_dosen, cocok[0]);
    }
  }
  if (masalah.length) {
    return {
      hasil: 'perlu_perbaikan',
      masalah,
      menungguPersetujuan: menunggu.map((s) => `${s.nama} (${s.nim}, ${s.jenis_label} ${s.fase})`),
      saran: 'Tanyakan ke dosen nama lengkap atau NIM yang dimaksud.',
    };
  }
  if (dipilih.size === 0) {
    return {
      hasil: 'tidak_ada_perubahan',
      pesan: sudah.length ? `Sidang ${sudah.join(', ')} sudah Anda setujui di SISKA.` : 'Tidak ada mahasiswa yang menunggu persetujuan sidang Anda.',
    };
  }
  const daftar = [...dipilih.values()];
  const ringkasan = [
    '📝 *Rencana setujui sidang di SISKA*',
    ...daftar.map((s) => `- ${s.nim} ${s.nama} · ${s.jenis_label}, sidang ${s.fase}`),
    ...(sudah.length ? [`_Sudah disetujui sebelumnya, dilewati: ${sudah.join(', ')}_`] : []),
    'Persetujuan sidang tidak bisa dibatalkan dari bot (hanya admin SISKA).',
  ].join('\n');
  const data: DataSidang = {
    mahasiswa: daftar.map((s) => ({ id: s.id_karya_akhir_dosen, nim: s.nim, nama: s.nama, jenis: s.jenis_label, fase: s.fase })),
  };
  return simpanRencana(ctx, 'setujui_sidang', data, ringkasan);
}

const BAB_VALID = JENIS.map((j) => j.id) as string[];
const labelBerkas = (b: { jenis: string; versi: number; fileName: string | null }) =>
  terpisah(b.jenis) ? `${labelJenisPendek(b.jenis)}: ${b.fileName ?? 'berkas'}` : `${labelJenisPendek(b.jenis)} v${b.versi}`;

/** Mahasiswa bimbingan kresna-dosen yang cocok dengan nama/NIM. */
async function cariMahasiswaBimbingan(cari: string) {
  const semua = await db().select({ id: users.id, nim: users.nim, nama: users.nama, judul: users.judulSkripsi }).from(users).where(eq(users.role, 'mahasiswa'));
  return cocokPeserta(cari, semua.map((m) => ({ ...m, nim: m.nim ?? '' })));
}

/**
 * Tool: rencana mengirim keputusan berkas (kirim revisi / setujui bab) di kresna-dosen. Berkas yang dipilih: yang
 * belum diputus (status menunggu atau draf) milik mahasiswa itu, opsional dibatasi bab. Semua catatan DRAF ikut
 * terkirim ke mahasiswa, sama seperti tombol Kirim di web.
 */
export async function rencanaKeputusanBerkas(
  f: { mahasiswa: string; bab?: string; keputusan: 'perlu_revisi' | 'disetujui'; ringkasan?: string },
  ctx: Konteks,
) {
  const tolak = tolakBila(ctx);
  if (tolak) return tolak;
  const cocok = await cariMahasiswaBimbingan(f.mahasiswa);
  if (cocok.length !== 1) {
    return {
      hasil: 'perlu_perbaikan',
      pesan: cocok.length === 0 ? `Tidak ada mahasiswa bimbingan yang cocok dengan "${f.mahasiswa}".` : `Ada ${cocok.length} mahasiswa yang cocok; minta nama lengkap atau NIM.`,
      kandidat: cocok.slice(0, 10).map((m) => `${m.nama} (${m.nim})`),
    };
  }
  const m = cocok[0];
  const bab = f.bab && BAB_VALID.includes(f.bab) ? f.bab : undefined;
  const terbuka = await db()
    .select()
    .from(berkas)
    .where(and(eq(berkas.mahasiswaId, m.id), inArray(berkas.status, ['menunggu', 'draf']), ...(bab ? [eq(berkas.jenis, bab)] : [])))
    .orderBy(desc(berkas.createdAt));
  if (terbuka.length !== 1) {
    return {
      hasil: 'perlu_perbaikan',
      pesan:
        terbuka.length === 0
          ? `${m.nama} tidak punya berkas${bab ? ` ${labelJenisPendek(bab)}` : ''} yang menunggu keputusan.`
          : `${m.nama} punya ${terbuka.length} berkas yang menunggu keputusan; tanyakan bab yang dimaksud.`,
      berkasMenunggu: terbuka.map((b) => `${labelBerkas(b)} (${b.jenis}, status ${b.status})`),
    };
  }
  const b = terbuka[0];
  const label = labelBerkas(b);
  const draf = await db()
    .select({ jenis: revisi.jenis })
    .from(revisi)
    .where(and(eq(revisi.berkasId, b.id), eq(revisi.status, 'draf')));
  const wajib = draf.filter((r) => r.jenis === 'wajib').length;
  const saran = draf.length - wajib;
  const ringkasan = f.ringkasan?.replace(/\s+/g, ' ').trim().slice(0, 1500) || undefined;

  if (f.keputusan === 'perlu_revisi') {
    if (draf.length === 0 && !ringkasan) {
      return {
        hasil: 'perlu_perbaikan',
        pesan: `Belum ada catatan draf untuk ${m.nama} ${label}. Tulis catatannya di web, atau minta dosen menyebutkan ringkasan revisinya.`,
      };
    }
    const teks = [
      '📝 *Kirim revisi ke mahasiswa*',
      `${m.nama} (${m.nim}) · ${label}`,
      `Keputusan: *Perlu revisi* · ${wajib} catatan wajib, ${saran} saran ikut terkirim`,
      ...(ringkasan ? [`Ringkasan: _${ringkasan}_`] : []),
    ].join('\n');
    return simpanRencana(ctx, 'kirim_revisi', { berkasId: b.id, mahasiswaId: m.id, nama: m.nama, label, keputusan: 'perlu_revisi', ringkasan, umumkan: false } satisfies DataKirimRevisi, teks);
  }

  // Setujui bab: aturan approve hanya diperingatkan, keputusan tetap di tangan dosen (sama seperti tombol Setujui di web).
  const rekap = await rekapPerbaikan(b.id);
  const peringatan =
    rekap && !rekap.bolehDisetujui
      ? rekap.pengecekanKe < 2
        ? 'ini baru pengecekan ke-1'
        : rekap.belumDinilai > 0
          ? `${rekap.belumDinilai} catatan bimbingan sebelumnya belum dinilai`
          : `sub bab yang belum lebih dari ${AMBANG_PERSEN}% diperbaiki: ${rekap.perSubBab
              .filter((x) => !x.lolos)
              .map((x) => `${x.subBab} (${x.persen}%)`)
              .join(', ')}`
      : null;
  const teks = [
    '📝 *Setujui bab*',
    `${m.nama} (${m.nim}) · ${label} → *Disetujui* ✅`,
    draf.length ? `${wajib} catatan wajib, ${saran} saran yang masih draf ikut terkirim.` : null,
    'Mahasiswa diberi tahu dan hasilnya diumumkan di grup laporan WhatsApp.',
    peringatan ? `⚠️ Belum memenuhi aturan approve (${peringatan}). Tetap disetujui bila Anda membalas ya.` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return simpanRencana(
    ctx,
    'kirim_revisi',
    {
      berkasId: b.id,
      mahasiswaId: m.id,
      nama: m.nama,
      label,
      keputusan: 'disetujui',
      ringkasan: ringkasan ?? 'Disetujui oleh dosen pembimbing. Silakan lanjut ke tahap berikutnya.',
      umumkan: true,
    } satisfies DataKirimRevisi,
    teks,
  );
}

/** Jalankan kirim revisi / setujui bab; dicek ulang bahwa berkas masih menunggu keputusan. */
async function jalankanKirimRevisi(d: DataKirimRevisi) {
  const [b] = await db().select().from(berkas).where(eq(berkas.id, d.berkasId)).limit(1);
  if (!b) throw new Error(`Berkas ${d.label} milik ${d.nama} tidak ditemukan.`);
  if (b.status !== 'menunggu' && b.status !== 'draf') {
    throw new Error(`${d.nama} ${d.label} sudah berstatus ${b.status === 'digantikan' ? 'digantikan versi baru' : b.status.replace('_', ' ')}; tidak dikirim ulang.`);
  }
  const h = await kirimRevisi(d.berkasId, d.keputusan, d.ringkasan, 'bot');
  const baris = [
    d.keputusan === 'disetujui'
      ? `✅ ${d.nama} · ${d.label} disetujui${h.terkirim ? ` (${h.terkirim} catatan ikut terkirim)` : ''}. Mahasiswa sudah diberi tahu.`
      : `✅ Revisi terkirim ke ${d.nama} · ${d.label}: ${h.terkirim} catatan, keputusan Perlu revisi.`,
  ];
  if (d.umumkan) {
    try {
      const hasil = await kirimKeGrup(teksPengumuman([{ nama: d.nama, label: d.label, keputusan: d.keputusan }]));
      const ok = hasil.filter((x) => x.terkirim).map((x) => x.grup);
      baris.push(ok.length ? `Diumumkan di grup: ${ok.join(', ')}.` : `⚠️ Gagal mengumumkan di grup: ${hasil.map((x) => x.error).join('; ')}`);
    } catch (e) {
      baris.push(`⚠️ Belum diumumkan di grup: ${(e as Error).message}`);
    }
  }
  return baris.join('\n');
}

/**
 * Tool: rencana mengubah judul skripsi mahasiswa di kresna-dosen (users.judul_skripsi). Judul di SISKA tidak ikut berubah.
 */
export async function rencanaUbahJudul(f: { mahasiswa: string; judul: string }, ctx: Konteks) {
  const tolak = tolakBila(ctx);
  if (tolak) return tolak;
  const judul = f.judul.replace(/\s+/g, ' ').replace(/^["“”']+|["“”']+$/g, '').trim();
  if (judul.length < 10 || judul.length > 500) return { hasil: 'perlu_perbaikan', pesan: 'Judul harus 10–500 karakter.' };
  const semua = await db()
    .select({ id: users.id, nim: users.nim, nama: users.nama, judul: users.judulSkripsi })
    .from(users)
    .where(eq(users.role, 'mahasiswa'));
  const cocok = cocokPeserta(f.mahasiswa, semua.map((m) => ({ ...m, nim: m.nim ?? '' })));
  if (cocok.length !== 1) {
    return {
      hasil: 'perlu_perbaikan',
      pesan: cocok.length === 0 ? `Tidak ada mahasiswa bimbingan yang cocok dengan "${f.mahasiswa}".` : `Ada ${cocok.length} mahasiswa yang cocok; minta nama lengkap atau NIM.`,
      kandidat: cocok.slice(0, 10).map((m) => `${m.nama} (${m.nim})`),
    };
  }
  const m = cocok[0];
  if ((m.judul ?? '').trim() === judul) return { hasil: 'perlu_perbaikan', pesan: `Judul ${m.nama} sudah persis seperti itu; tidak ada yang perlu diubah.` };
  const ringkasan = [
    '📝 *Rencana ubah judul skripsi (kresna-dosen)*',
    `${m.nama} (${m.nim})`,
    `Judul lama: ${m.judul ? `_${m.judul}_` : '(belum diisi)'}`,
    `Judul baru: *${judul}*`,
    'Judul di SISKA tidak ikut berubah.',
  ].join('\n');
  return simpanRencana(ctx, 'ubah_judul', { userId: m.id, nim: m.nim, nama: m.nama, judulLama: m.judul, judulBaru: judul }, ringkasan);
}

/**
 * Balasan "ya" / "batal" dari dosen untuk rencana yang menunggu. Mengembalikan teks balasan, atau null bila
 * pesan bukan konfirmasi (lalu diproses Claude seperti biasa). Dijalankan tanpa Claude.
 */
export async function tanganiKonfirmasi(teks: string, ctx: Konteks): Promise<string | null> {
  const k = kata(teks);
  if (k.length === 0 || k.length > 3) return null;
  const ya = k.some((w) => KATA_YA.has(w));
  const batal = k.some((w) => KATA_BATAL.has(w));
  if (ya === batal) return null;
  if (!ctx.pengirimId || !ctx.bolehMengubah) return null;

  const [r] = await db()
    .select()
    .from(botAksi)
    .where(and(eq(botAksi.chatId, ctx.chatId), eq(botAksi.pengirimId, ctx.pengirimId), eq(botAksi.status, 'menunggu')))
    .orderBy(desc(botAksi.id))
    .limit(1);
  if (!r) return ya ? 'Tidak ada rencana yang menunggu konfirmasi.' : null;

  if (batal) {
    await db().update(botAksi).set({ status: 'dibatalkan', hasil: 'Dibatalkan dosen.', selesaiAt: new Date() }).where(eq(botAksi.id, r.id));
    return 'Rencana dibatalkan. Tidak ada yang diubah.';
  }
  if (r.kedaluwarsaAt.getTime() < Date.now()) {
    await db().update(botAksi).set({ status: 'dibatalkan', hasil: 'Kedaluwarsa.', selesaiAt: new Date() }).where(eq(botAksi.id, r.id));
    return `Rencana sudah lebih dari ${MENIT_BERLAKU} menit, jadi tidak dijalankan. Minta ulang bila masih perlu.`;
  }

  // Klaim atomik: webhook ganda atau dua kali "ya" tidak menjalankan rencana dua kali.
  const [klaim] = await db()
    .update(botAksi)
    .set({ status: 'dijalankan', selesaiAt: new Date() })
    .where(and(eq(botAksi.id, r.id), eq(botAksi.status, 'menunggu'), sql`${botAksi.kedaluwarsaAt} > now()`))
    .returning({ id: botAksi.id });
  if (!klaim) return 'Rencana ini sudah diproses sebelumnya.';

  // Rencana lama (satu jenis) tetap bisa dijalankan; rencana gabungan dijalankan langkah demi langkah, berurutan.
  const langkah: Langkah[] =
    r.jenis === 'gabungan' ? (r.data as DataGabungan).langkah : [{ jenis: r.jenis as JenisLangkah, data: r.data, ringkasan: r.ringkasan }];
  const baris: string[] = [];
  let berhasil = 0;
  for (const [i, l] of langkah.entries()) {
    const no = langkah.length > 1 ? `*${i + 1}.* ` : '';
    try {
      baris.push(no + (await jalankanLangkah(l.jenis, l.data)));
      berhasil += 1;
    } catch (e) {
      // Satu langkah gagal tidak menghentikan langkah berikutnya; semuanya dilaporkan.
      baris.push(`${no}❌ Gagal: ${(e as Error).message.slice(0, 300)}`);
    }
  }
  const hasil = baris.join(langkah.length > 1 ? '\n\n' : '\n');
  await db()
    .update(botAksi)
    .set({ status: berhasil === 0 ? 'gagal' : 'dijalankan', hasil: hasil.slice(0, 4000) })
    .where(eq(botAksi.id, r.id));
  return hasil;
}

/** Jalankan satu langkah rencana dan kembalikan teks hasilnya. Melempar galat bila gagal. */
async function jalankanLangkah(jenis: JenisLangkah, data: unknown): Promise<string> {
  let hasil: string;
  if (jenis === 'ubah_presensi') {
    const d = data as DataUbah;
    const u = await ubahPresensi(d.kelasId, d.pertemuanId, d.perubahan.map(({ nim, status, keterangan }) => ({ nim, status, keterangan })));
    const { peserta } = await getPresensi(d.kelasId, d.pertemuanId);
    const n = (s: Kode | null) => peserta.filter((x) => x.status === s).length;
    hasil = [
      `✅ Tersimpan di SISKA: ${u.diubah} mahasiswa, ${d.kelas} pertemuan ke-${d.pertemuanKe}.`,
      ...u.ditolak.map((x) => `⚠️ ${x.nim}: ${x.alasan}`),
      `Rekap sekarang: ${n('H')} Hadir, ${n('S')} Sakit, ${n('I')} Izin, ${n('A')} Alfa, ${n(null)} belum diisi.`,
    ].join('\n');
  } else if (jenis === 'ubah_judul') {
    const d = data as DataJudul;
    await db().update(users).set({ judulSkripsi: d.judulBaru }).where(eq(users.id, d.userId));
    await catatAktivitas(d.userId, `Judul skripsi diubah dosen: ${d.judulBaru}`);
    const [cek] = await db().select({ judul: users.judulSkripsi }).from(users).where(eq(users.id, d.userId)).limit(1);
    hasil = cek?.judul === d.judulBaru ? `✅ Judul skripsi ${d.nama} di kresna-dosen sekarang:\n*${d.judulBaru}*` : `⚠️ Judul ${d.nama} belum berubah. Cek di panel dosen.`;
  } else if (jenis === 'setujui_bimbingan') {
    const d = data as DataSetuju;
    const h = await setujuiBimbingan(d.jenis, d.idKaryaAkhir, d.bimbingan.map((b) => b.id));
    const ke = (ids: number[]) => ids.map((id) => `ke-${d.bimbingan.find((b) => b.id === id)?.ke ?? id}`).join(', ');
    hasil = [
      h.disetujui.length ? `✅ Disetujui di SISKA: ${d.nama}, bimbingan ${ke(h.disetujui)}.` : `Tidak ada bimbingan ${d.nama} yang berubah.`,
      h.sudah_disetujui_sebelumnya.length ? `Sudah disetujui sebelumnya: ${ke(h.sudah_disetujui_sebelumnya)}.` : null,
      h.gagal.length ? `⚠️ Belum berubah di SISKA: ${ke(h.gagal)}. Cek di web SISKA.` : null,
    ]
      .filter(Boolean)
      .join('\n');
  } else if (jenis === 'setujui_sidang') {
    const d = data as DataSidang;
    const h = await setujuiSidang(d.mahasiswa.map((m) => m.id));
    const nama = (xs: { nama: string }[]) => xs.map((x) => x.nama).join(', ');
    hasil = [
      h.disetujui.length ? `✅ Sidang disetujui di SISKA: ${nama(h.disetujui)}.` : 'Tidak ada persetujuan sidang yang berubah.',
      h.sudah_disetujui_sebelumnya.length ? `Sudah disetujui sebelumnya: ${nama(h.sudah_disetujui_sebelumnya)}.` : null,
      h.gagal.length ? `⚠️ Belum berubah di SISKA: ${nama(h.gagal)}. Cek di web SISKA.` : null,
      h.disetujui.length
        ? `Status keseluruhan: ${h.disetujui.map((x) => `${x.nama} ${x.status_keseluruhan}`).join('; ')}.`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  } else if (jenis === 'kirim_revisi') {
    hasil = await jalankanKirimRevisi(data as DataKirimRevisi);
  } else {
    const d = data as DataMulai;
    await mulaiSesi(d.pertemuanId);
    const p = (await getKelas(d.kelasId)).pertemuan.find((x) => x.id === d.pertemuanId);
    hasil = `✅ Sesi ${d.kelas} pertemuan ke-${d.pertemuanKe} dimulai. Status di SISKA sekarang: ${p?.status ?? 'tidak terbaca'}.`;
  }
  return hasil;
}
