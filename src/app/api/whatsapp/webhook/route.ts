import { waitUntil } from '@vercel/functions';
import { tanganiPesanBot } from '@/lib/bot-wa';
import { hmacWebhookValid, simpanPesanWebhook, webhookSiap } from '@/lib/wa-pesan';
import { sesi } from '@/lib/waha';

export const dynamic = 'force-dynamic';
// Jawaban bot (Claude API) dikirim di latar lewat waitUntil.
export const maxDuration = 300;

const EVENT_PESAN = new Set(['message', 'message.any']);

/**
 * Webhook dari WAHA (WHATSAPP_HOOK_URL). Setiap permintaan wajib bertanda tangan HMAC-SHA512 atas body mentah
 * (header X-Webhook-Hmac) dengan kunci WAHA_WEBHOOK_HMAC_KEY. Event selain pesan, sesi lain, dan pesan dari grup
 * selain grup tujuan dibalas 200 tanpa disimpan supaya WAHA tidak mengulang kiriman.
 */
export async function POST(req: Request) {
  if (!webhookSiap()) return Response.json({ error: 'WAHA_WEBHOOK_HMAC_KEY belum diatur.' }, { status: 503 });
  const body = await req.text();
  if (!hmacWebhookValid(body, req.headers.get('x-webhook-hmac'), req.headers.get('x-webhook-hmac-algorithm'))) {
    return Response.json({ error: 'Tanda tangan HMAC tidak valid.' }, { status: 401 });
  }

  let ev: { event?: unknown; session?: unknown; payload?: unknown; me?: unknown };
  try {
    ev = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Body bukan JSON.' }, { status: 400 });
  }
  if (typeof ev.event !== 'string' || !EVENT_PESAN.has(ev.event)) return Response.json({ hasil: 'event_diabaikan' });
  if (typeof ev.session === 'string' && ev.session !== sesi()) return Response.json({ hasil: 'sesi_lain' });

  // Bot tanya-jawab: hanya grup yang diaktifkan dan hanya bila bot di-mention; dedup per ID pesan di bot_tanya.
  waitUntil(tanganiPesanBot(ev.payload, ev.me).catch((e) => console.error('Bot WhatsApp gagal', e)));

  try {
    return Response.json({ hasil: await simpanPesanWebhook(ev.payload) });
  } catch (e) {
    console.error('Gagal menyimpan pesan WhatsApp dari webhook', e);
    // 500 supaya WAHA mencoba lagi sesuai kebijakan retry-nya.
    return Response.json({ error: 'Gagal menyimpan pesan.' }, { status: 500 });
  }
}
