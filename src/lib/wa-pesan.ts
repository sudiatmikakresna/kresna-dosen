import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, count, desc, eq, max } from 'drizzle-orm';
import { db, waGrup, waPesan } from '@/db';
import { bacaPesan, riwayatPesan, type PesanChat } from './waha';

/**
 * Pesan grup WhatsApp masuk lewat webhook WAHA:
 *   WAHA (VPS) ──POST event message.any + X-Webhook-Hmac──► /api/whatsapp/webhook ──► tabel wa_pesan
 * Hanya pesan dari grup tujuan laporan (wa_grup.diizinkan) yang disimpan; grup lain, mis. grup kelas, diabaikan.
 */

export const webhookSiap = () => !!process.env.WAHA_WEBHOOK_HMAC_KEY;

/**
 * Cocokkan X-Webhook-Hmac dengan HMAC-SHA512 atas body mentah memakai WAHA_WEBHOOK_HMAC_KEY
 * (nilainya sama dengan WHATSAPP_HOOK_HMAC_KEY di WAHA). Perbandingan waktu-konstan.
 */
export function hmacWebhookValid(body: string, hmac: string | null, algoritma: string | null) {
  const kunci = process.env.WAHA_WEBHOOK_HMAC_KEY;
  if (!kunci || !hmac) return false;
  if (algoritma && algoritma.toLowerCase() !== 'sha512') return false;
  const harap = Buffer.from(createHmac('sha512', kunci).update(body, 'utf8').digest('hex'), 'utf8');
  const dapat = Buffer.from(hmac.trim().toLowerCase(), 'utf8');
  return harap.length === dapat.length && timingSafeEqual(harap, dapat);
}

async function grupDiizinkan(chatId: string) {
  const [g] = await db()
    .select({ chatId: waGrup.chatId })
    .from(waGrup)
    .where(and(eq(waGrup.chatId, chatId), eq(waGrup.diizinkan, true)))
    .limit(1);
  return !!g;
}

const baris = (p: PesanChat & { chatId: string }, sumber: 'webhook' | 'impor') => ({
  messageId: p.id,
  chatId: p.chatId,
  pengirim: p.pengirim,
  pengirimId: p.pengirimId,
  dariSaya: p.dariSaya,
  teks: p.teks,
  lampiran: p.lampiran,
  sumber,
  waktu: p.waktu ?? new Date(),
});

export type HasilSimpan = 'disimpan' | 'duplikat' | 'bukan_grup' | 'grup_lain';

/** Simpan satu payload event message/message.any. Kiriman ulang dengan ID pesan yang sama diabaikan. */
export async function simpanPesanWebhook(payload: unknown): Promise<HasilSimpan> {
  const p = bacaPesan(payload);
  if (!p.chatId) return 'bukan_grup';
  if (!(await grupDiizinkan(p.chatId))) return 'grup_lain';
  const r = await db()
    .insert(waPesan)
    .values(baris({ ...p, chatId: p.chatId }, 'webhook'))
    .onConflictDoNothing({ target: waPesan.messageId })
    .returning({ id: waPesan.id });
  return r.length ? 'disimpan' : 'duplikat';
}

/** Salin pesan yang masih ada di WAHA ke database (mis. pesan sebelum webhook aktif). Pesan yang sudah ada dilewati. */
export async function imporDariWaha(chatId: string, batas = 500) {
  if (!(await grupDiizinkan(chatId))) throw new Error('Grup ini bukan grup tujuan laporan.');
  const pesan = await riwayatPesan(chatId, batas);
  if (pesan.length === 0) return { dibaca: 0, baru: 0 };
  const r = await db()
    .insert(waPesan)
    .values(pesan.map((p) => baris({ ...p, chatId }, 'impor')))
    .onConflictDoNothing({ target: waPesan.messageId })
    .returning({ id: waPesan.id });
  return { dibaca: pesan.length, baru: r.length };
}

/** Pesan tersimpan untuk satu grup, terbaru dulu. */
export async function pesanTersimpan(chatId: string, batas: number) {
  return db().select().from(waPesan).where(eq(waPesan.chatId, chatId)).orderBy(desc(waPesan.waktu), desc(waPesan.id)).limit(batas);
}

export async function ringkasanPesan(chatId?: string) {
  const [r] = await db()
    .select({ jumlah: count(), terakhir: max(waPesan.createdAt) })
    .from(waPesan)
    .where(chatId ? eq(waPesan.chatId, chatId) : undefined);
  return { jumlah: Number(r?.jumlah ?? 0), terakhir: r?.terakhir ?? null };
}
