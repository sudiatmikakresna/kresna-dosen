import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Client, Receiver } from '@upstash/qstash';

/** Jeda sebelum berkas baru direview, supaya mahasiswa sempat mengganti berkas yang salah unggah. */
export const JEDA_MENIT = Number(process.env.REVIEW_JEDA_MENIT ?? 10);
export const qstashSiap = () => !!process.env.QSTASH_TOKEN;

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

export function originAplikasi() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
}

export const urlReview = (origin: string, berkasId: number) => `${origin}/api/review/${berkasId}`;

/**
 * Jadwalkan review otomatis untuk berkas baru lewat QStash: pesan tertunda JEDA_MENIT menit yang memanggil
 * /api/review/[id]. Bila mahasiswa mengganti berkasnya dalam jeda itu, review versi lama dilewati otomatis.
 * Gagal menjadwalkan tidak memengaruhi unggahan; dosen bisa memakai tombol review ulang antrian.
 */
export async function jadwalkanReview(berkasId: number) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (!qstashSiap()) return console.error('QSTASH_TOKEN belum diatur; review otomatis tidak dijadwalkan.', berkasId);
  const origin = originAplikasi();
  if (!origin) return console.error('APP_URL belum diatur; review otomatis tidak dijadwalkan.', berkasId);
  try {
    await new Client({ token: process.env.QSTASH_TOKEN! }).publishJSON({
      url: urlReview(origin, berkasId),
      body: { berkas_id: berkasId },
      delay: JEDA_MENIT * 60,
      retries: 2,
      deduplicationId: `review-berkas-${berkasId}`,
    });
  } catch (e) {
    console.error('Gagal menjadwalkan review otomatis', berkasId, e);
  }
}

/** Verifikasi bahwa permintaan benar-benar dari QStash untuk berkas ini (tanda tangan atas body dan URL). */
export async function tandaQstashValid(req: Request, body: string, berkasId: number) {
  const signature = req.headers.get('upstash-signature');
  const origin = originAplikasi();
  if (!signature || !origin) return false;
  try {
    return await new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    }).verify({ signature, body, url: urlReview(origin, berkasId), clockTolerance: 30 });
  } catch {
    return false;
  }
}
