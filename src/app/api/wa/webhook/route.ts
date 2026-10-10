import { waitUntil } from '@vercel/functions';
import { hmacValid, prosesPesan, type EventWaha } from '@/lib/wa-bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Webhook dari WAHA (lokal, lewat Cloudflare Tunnel). Hanya event bertanda tangan HMAC yang diproses. */
export async function POST(req: Request) {
  if (!process.env.WA_WEBHOOK_SECRET) return Response.json({ error: 'WA_WEBHOOK_SECRET belum diatur.' }, { status: 503 });
  const body = await req.text();
  if (!hmacValid(body, req.headers.get('x-webhook-hmac'))) return Response.json({ error: 'Tanda tangan tidak valid.' }, { status: 401 });

  let ev: EventWaha;
  try {
    ev = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Body bukan JSON.' }, { status: 400 });
  }
  // Balas 200 secepatnya; jawaban Claude dikirim di latar supaya WAHA tidak mengulang webhook.
  if (ev.event === 'message') waitUntil(prosesPesan(ev));
  return Response.json({ ok: true });
}
