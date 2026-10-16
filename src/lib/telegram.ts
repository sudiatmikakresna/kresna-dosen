import 'server-only';
import { eq } from 'drizzle-orm';
import { db, pengaturan, users, type Berkas } from '@/db';
import { driveViewUrl } from './google';
import { labelJenis, terpisah } from './labels';

// Alamat bisa diganti lewat env hanya untuk pengujian lokal.
const API = process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org';
const KUNCI_CHAT = 'telegram_chat_id';
const KUNCI_NAMA = 'telegram_chat_nama';

export const telegramSiap = () => !!process.env.TELEGRAM_BOT_TOKEN;

async function panggil<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum diatur.');
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram menolak ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function ambil(kunci: string) {
  const [row] = await db().select().from(pengaturan).where(eq(pengaturan.kunci, kunci)).limit(1);
  return row?.nilai ?? null;
}

async function simpan(kunci: string, nilai: string) {
  await db()
    .insert(pengaturan)
    .values({ kunci, nilai })
    .onConflictDoUpdate({ target: pengaturan.kunci, set: { nilai, updatedAt: new Date() } });
}

export async function chatTelegram() {
  const [id, nama] = await Promise.all([ambil(KUNCI_CHAT), ambil(KUNCI_NAMA)]);
  return id ? { id, nama: nama ?? id } : null;
}

export async function putuskanTelegram() {
  await db().delete(pengaturan).where(eq(pengaturan.kunci, KUNCI_CHAT));
  await db().delete(pengaturan).where(eq(pengaturan.kunci, KUNCI_NAMA));
}

/** Username bot dari token yang terpasang, untuk memastikan token milik bot yang benar. */
export async function infoBot() {
  try {
    const me = await panggil<{ username: string; first_name: string }>('getMe');
    return { username: me.username, nama: me.first_name, error: null };
  } catch (e) {
    return { username: null, nama: null, error: (e as Error).message };
  }
}

/** Simpan chat ID yang diisi manual, setelah memastikan bot bisa mengirim ke chat itu. */
export async function simpanChatManual(id: string) {
  const chat = await panggil<{ id: number; type: string; first_name?: string; last_name?: string; title?: string; username?: string }>('getChat', { chat_id: id });
  const nama = chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(' ') || (chat.username ? `@${chat.username}` : String(chat.id)));
  await simpan(KUNCI_CHAT, String(chat.id));
  await simpan(KUNCI_NAMA, nama);
  return { id: String(chat.id), nama };
}

type Update = { message?: { chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string } } };

/** Cari chat pribadi terakhir yang mengirim pesan ke bot, lalu simpan sebagai tujuan notifikasi. */
export async function deteksiChat() {
  const updates = await panggil<Update[]>('getUpdates', { allowed_updates: ['message'] });
  const chat = updates
    .map((u) => u.message?.chat)
    .filter((c): c is NonNullable<typeof c> => !!c && c.type === 'private')
    .at(-1);
  if (!chat) return null;
  const nama = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || (chat.username ? `@${chat.username}` : String(chat.id));
  await simpan(KUNCI_CHAT, String(chat.id));
  await simpan(KUNCI_NAMA, nama);
  return { id: String(chat.id), nama };
}

export async function kirimTelegram(html: string) {
  const chat = await chatTelegram();
  if (!telegramSiap() || !chat) return false;
  await panggil('sendMessage', { chat_id: chat.id, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  return true;
}

/** Notifikasi setiap kali revisi dikirim ke mahasiswa (dari web atau MCP). */
export async function notifRevisiTerkirim(
  b: Berkas,
  keputusan: 'perlu_revisi' | 'disetujui',
  wajib: number,
  saran: number,
  oleh: 'web' | 'mcp',
) {
  try {
    if (!telegramSiap()) return;
    const [m] = await db().select().from(users).where(eq(users.id, b.mahasiswaId)).limit(1);
    if (!m) return;
    const app = (process.env.APP_URL ?? '').replace(/\/$/, '');
    const judul = terpisah(b.jenis) ? `${labelJenis(b.jenis).split(' · ')[0]}: ${b.fileName ?? 'berkas'}` : `${labelJenis(b.jenis)}, versi ${b.versi}`;
    const baris = [
      keputusan === 'disetujui' ? '🎓 <b>Bab disetujui</b>' : '📝 <b>Revisi dikirim</b>',
      `<b>${esc(m.nama)}</b> (${esc(m.nim ?? '-')})`,
      esc(judul),
      `Catatan: ${wajib} wajib, ${saran} saran · ${oleh === 'mcp' ? 'lewat agent AI' : 'lewat web'}`,
    ];
    if (app) baris.push('', `<a href="${app}/dosen/berkas/${b.id}">Lihat di aplikasi</a>`);
    await kirimTelegram(baris.join('\n'));
  } catch (err) {
    console.error('Gagal mengirim notifikasi Telegram', err);
  }
}

/** Notifikasi ke dosen saat mahasiswa mengirim berkas baru. Gagal kirim tidak memengaruhi unggahan. */
export async function notifBerkasBaru(b: Berkas) {
  try {
    if (!telegramSiap()) return;
    const [m] = await db().select().from(users).where(eq(users.id, b.mahasiswaId)).limit(1);
    if (!m) return;
    const app = (process.env.APP_URL ?? '').replace(/\/$/, '');
    const judul = terpisah(b.jenis) ? `${labelJenis(b.jenis).split(' · ')[0]}: ${b.fileName ?? 'berkas'}` : `${labelJenis(b.jenis)}, versi ${b.versi}`;
    const baris = [
      '📄 <b>Berkas baru masuk</b>',
      `<b>${esc(m.nama)}</b> (${esc(m.nim ?? '-')})`,
      esc(judul),
      b.sumber === 'gdocs' ? 'Sumber: link Google Docs' : `File: ${esc(b.fileName ?? '-')}`,
    ];
    if (b.catatan) baris.push(`Catatan: <i>${esc(b.catatan.slice(0, 300))}</i>`);
    const tautan = [];
    if (app) tautan.push(`<a href="${app}/dosen/berkas/${b.id}">Tinjau di aplikasi</a>`);
    if (b.driveFileId) tautan.push(`<a href="${driveViewUrl(b.driveFileId)}">Buka di Drive</a>`);
    if (tautan.length) baris.push('', tautan.join(' · '));
    await kirimTelegram(baris.join('\n'));
  } catch (err) {
    console.error('Gagal mengirim notifikasi Telegram', err);
  }
}
