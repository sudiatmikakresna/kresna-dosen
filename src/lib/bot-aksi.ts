import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { botAksi, db } from '@/db';
import { cariKelas, perluKelas } from './bot-siska';
import { getKelas, mulaiSesi, type Pertemuan } from './siska/kelas';
import { getPresensi, ubahPresensi, type Peserta } from './siska/presensi';

/**
 * Absensi SISKA lewat bot WhatsApp, dengan konfirmasi dua langkah:
 *   1. Dosen meminta ("@bot absen hadir Rifqi"). Claude memanggil tool rencana_*; kode di sini mencocokkan
 *      kelas, pertemuan, dan mahasiswa, lalu menyimpan RENCANA di bot_aksi. Belum ada yang berubah di SISKA.
 *   2. Bot mengirim ringkasan rencana (teks dari kode ini, bukan dari Claude). Dosen membalas "ya".
 *      Yang dijalankan persis isi rencana, sekali, sebelum kedaluwarsa. Claude tidak ikut di langkah ini.
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

export type Konteks = { chatId: string; pengirimId: string | null; bolehMengubah: boolean };

const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
const kata = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

/** Satu peserta yang cocok dengan NIM (penuh atau akhiran) atau semua kata nama; selain itu daftar kandidat. */
export function cocokPeserta(cari: string, peserta: Peserta[]) {
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

async function simpanRencana(ctx: Konteks, jenis: 'ubah_presensi' | 'mulai_sesi', data: DataUbah | DataMulai, ringkasan: string) {
  // Satu rencana aktif per dosen per grup: rencana lama yang belum dikonfirmasi diganti.
  await db()
    .update(botAksi)
    .set({ status: 'dibatalkan', hasil: 'Diganti rencana baru.', selesaiAt: new Date() })
    .where(and(eq(botAksi.chatId, ctx.chatId), eq(botAksi.pengirimId, ctx.pengirimId!), eq(botAksi.status, 'menunggu')));
  await db()
    .insert(botAksi)
    .values({
      chatId: ctx.chatId,
      pengirimId: ctx.pengirimId!,
      jenis,
      data,
      ringkasan,
      kedaluwarsaAt: new Date(Date.now() + MENIT_BERLAKU * 60_000),
    });
  return {
    hasil: 'rencana_dibuat',
    pesanKonfirmasi: `${ringkasan}\n\nBalas pesan ini dengan *ya* dalam ${MENIT_BERLAKU} menit untuk menyimpan, atau *batal*.`,
  };
}

function tolakBila(ctx: Konteks) {
  if (!ctx.bolehMengubah) {
    return { hasil: 'error', pesan: 'Absensi lewat bot hanya aktif bila daftar nomor yang diizinkan di halaman bot diisi.' };
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
    return 'Rencana dibatalkan. Tidak ada yang diubah di SISKA.';
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

  try {
    let hasil: string;
    if (r.jenis === 'ubah_presensi') {
      const d = r.data as DataUbah;
      const u = await ubahPresensi(d.kelasId, d.pertemuanId, d.perubahan.map(({ nim, status, keterangan }) => ({ nim, status, keterangan })));
      const { peserta } = await getPresensi(d.kelasId, d.pertemuanId);
      const n = (s: Kode | null) => peserta.filter((x) => x.status === s).length;
      hasil = [
        `✅ Tersimpan di SISKA: ${u.diubah} mahasiswa, ${d.kelas} pertemuan ke-${d.pertemuanKe}.`,
        ...u.ditolak.map((x) => `⚠️ ${x.nim}: ${x.alasan}`),
        `Rekap sekarang: ${n('H')} Hadir, ${n('S')} Sakit, ${n('I')} Izin, ${n('A')} Alfa, ${n(null)} belum diisi.`,
      ].join('\n');
    } else {
      const d = r.data as DataMulai;
      await mulaiSesi(d.pertemuanId);
      const p = (await getKelas(d.kelasId)).pertemuan.find((x) => x.id === d.pertemuanId);
      hasil = `✅ Sesi ${d.kelas} pertemuan ke-${d.pertemuanKe} dimulai. Status di SISKA sekarang: ${p?.status ?? 'tidak terbaca'}.`;
    }
    await db().update(botAksi).set({ hasil }).where(eq(botAksi.id, r.id));
    return hasil;
  } catch (e) {
    const pesan = (e as Error).message.slice(0, 300);
    await db().update(botAksi).set({ status: 'gagal', hasil: pesan }).where(eq(botAksi.id, r.id));
    return `❌ Gagal menyimpan ke SISKA: ${pesan}`;
  }
}
