import 'server-only';
import { headers } from 'next/headers';
import { and, count, eq, gt, like, lt } from 'drizzle-orm';
import { db, loginGagal } from '@/db';
import { esc, kirimTelegram } from './telegram';

/** Batas percobaan login dosen: maksimal 8 gagal per username atau per IP dalam 15 menit. */
const JENDELA_MS = 15 * 60_000;
const MAKS_GAGAL = 8;

export async function ipPeminta() {
  const h = await headers();
  return (h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? 'tidak-diketahui').trim();
}

async function jumlahGagal(kolom: 'username' | 'ip', nilai: string) {
  const [r] = await db()
    .select({ n: count() })
    .from(loginGagal)
    .where(and(eq(kolom === 'username' ? loginGagal.username : loginGagal.ip, nilai), gt(loginGagal.createdAt, new Date(Date.now() - JENDELA_MS))));
  return Number(r?.n ?? 0);
}

/** true bila username atau IP sedang terkunci karena terlalu banyak gagal. */
export async function loginTerkunci(username: string, ip: string) {
  const [u, i] = await Promise.all([jumlahGagal('username', username.toLowerCase()), jumlahGagal('ip', ip)]);
  return u >= MAKS_GAGAL || i >= MAKS_GAGAL;
}

export async function catatLoginGagal(username: string, ip: string) {
  const u = username.toLowerCase().slice(0, 64);
  await db().insert(loginGagal).values({ username: u, ip });
  // Bersihkan catatan lama sesekali supaya tabel tetap kecil.
  if (Math.random() < 0.05) await db().delete(loginGagal).where(lt(loginGagal.createdAt, new Date(Date.now() - 7 * 86_400_000)));
  if ((await jumlahGagal('username', u)) === MAKS_GAGAL || (await jumlahGagal('ip', ip)) === MAKS_GAGAL) {
    await peringatan(`🚨 <b>Login dosen dikunci 15 menit</b>\n${MAKS_GAGAL} percobaan gagal untuk username <code>${esc(u)}</code> dari IP <code>${esc(ip)}</code>.`);
  }
}

/** Kirim peringatan keamanan ke Telegram dosen. Gagal kirim tidak menghentikan proses. */
export async function peringatan(html: string) {
  try {
    await kirimTelegram(html);
  } catch (e) {
    console.error('Peringatan keamanan gagal dikirim', e);
  }
}

/**
 * Batas reset password mandiri mahasiswa: maksimal 3 per NIM dan 10 per IP dalam 1 jam. Dicatat di tabel loginGagal
 * dengan username berawalan "reset:", jadi tidak ikut menghitung kunci login dosen per username.
 */
const JENDELA_RESET_MS = 60 * 60_000;

export async function resetTerlaluSering(nim: string, ip: string) {
  const sejak = new Date(Date.now() - JENDELA_RESET_MS);
  const [[perNim], [perIp]] = await Promise.all([
    db().select({ n: count() }).from(loginGagal).where(and(eq(loginGagal.username, `reset:${nim}`.slice(0, 64)), gt(loginGagal.createdAt, sejak))),
    db().select({ n: count() }).from(loginGagal).where(and(eq(loginGagal.ip, ip), like(loginGagal.username, 'reset:%'), gt(loginGagal.createdAt, sejak))),
  ]);
  return Number(perNim?.n ?? 0) >= 3 || Number(perIp?.n ?? 0) >= 10;
}

export async function catatReset(nim: string, ip: string) {
  await db().insert(loginGagal).values({ username: `reset:${nim}`.slice(0, 64), ip });
}

/**
 * Batas pendaftaran mahasiswa per IP dalam 1 jam: maksimal 10 kode salah dan 20 akun baru. Batasnya longgar karena
 * satu kelas di Wi-Fi kampus bisa memakai IP yang sama. Dicatat di tabel loginGagal dengan username berawalan
 * "daftar:" (berhasil) atau "daftar-salah:" (kode salah), jadi tidak ikut menghitung kunci login dosen.
 */
const JENDELA_DAFTAR_MS = 60 * 60_000;
const MAKS_KODE_SALAH = 10;
const MAKS_DAFTAR = 20;

async function jumlahDaftar(ip: string, awalan: string) {
  const [r] = await db()
    .select({ n: count() })
    .from(loginGagal)
    .where(and(eq(loginGagal.ip, ip), like(loginGagal.username, `${awalan}%`), gt(loginGagal.createdAt, new Date(Date.now() - JENDELA_DAFTAR_MS))));
  return Number(r?.n ?? 0);
}

export async function daftarTerlaluSering(ip: string) {
  const [salah, berhasil] = await Promise.all([jumlahDaftar(ip, 'daftar-salah:'), jumlahDaftar(ip, 'daftar:')]);
  return salah >= MAKS_KODE_SALAH || berhasil >= MAKS_DAFTAR;
}

export async function catatDaftar(nim: string, ip: string, berhasil: boolean) {
  await db().insert(loginGagal).values({ username: `${berhasil ? 'daftar:' : 'daftar-salah:'}${nim}`.slice(0, 64), ip });
  if (!berhasil && (await jumlahDaftar(ip, 'daftar-salah:')) === MAKS_KODE_SALAH) {
    await peringatan(`🚨 <b>Pendaftaran dikunci 1 jam</b>\n${MAKS_KODE_SALAH} kode pendaftaran salah dari IP <code>${esc(ip)}</code>.`);
  }
}

/** Bandingkan kode pendaftaran dengan KODE_DAFTAR. Kosong berarti pendaftaran ditutup. */
export function pendaftaranDibuka() {
  return Boolean(process.env.KODE_DAFTAR?.trim());
}

export function kodeDaftarBenar(kode: string) {
  const benar = process.env.KODE_DAFTAR?.trim().toUpperCase() ?? '';
  const masuk = kode.trim().toUpperCase();
  if (!benar || masuk.length !== benar.length) return false;
  let beda = 0;
  for (let i = 0; i < benar.length; i++) beda |= benar.charCodeAt(i) ^ masuk.charCodeAt(i);
  return beda === 0;
}
