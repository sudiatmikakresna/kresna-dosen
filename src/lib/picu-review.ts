import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Rahasia internal untuk endpoint review, diturunkan dari SESSION_SECRET supaya tidak perlu env tambahan. */
export function rahasiaReview() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET belum diatur.');
  return createHash('sha256').update(`${s}:review-ai`).digest('hex');
}

export function rahasiaReviewValid(header: string | null) {
  const harap = Buffer.from(`Bearer ${rahasiaReview()}`);
  const dapat = Buffer.from(header ?? '');
  return harap.length === dapat.length && timingSafeEqual(harap, dapat);
}

function originAplikasi() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
}

/**
 * Minta review otomatis untuk berkas baru. Review berjalan di fungsi /api/review/[id] sendiri (batas waktunya
 * terpisah dari unggahan); di sini hanya menunggu endpoint menerima permintaan. Gagal memicu tidak memengaruhi unggahan.
 */
export async function picuReview(berkasId: number) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const origin = originAplikasi();
  if (!origin) return console.error('APP_URL belum diatur; review otomatis tidak dipicu.');
  try {
    const res = await fetch(`${origin}/api/review/${berkasId}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${rahasiaReview()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error('Endpoint review menolak', berkasId, res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.error('Gagal memicu review otomatis', berkasId, e);
  }
}
