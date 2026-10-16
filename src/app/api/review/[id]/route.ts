import { waitUntil } from '@vercel/functions';
import { rahasiaReviewValid, tandaQstashValid } from '@/lib/picu-review';
import { prosesBerkasBaru, reviewAiSiap } from '@/lib/review-ai';

export const dynamic = 'force-dynamic';
// Review satu berkas (unduh PDF + Claude API) bisa memakan beberapa menit.
export const maxDuration = 300;

/**
 * Dipanggil QStash JEDA_MENIT menit setelah berkas diunggah (bertanda tangan Upstash), atau dengan rahasia internal.
 * Langsung membalas 202 supaya QStash tidak mengulang; review berjalan di latar.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'ID berkas tidak valid.' }, { status: 400 });
  const body = await req.text();
  const sah = rahasiaReviewValid(req.headers.get('authorization')) || (await tandaQstashValid(req, body, id));
  if (!sah) return Response.json({ error: 'Tidak diizinkan.' }, { status: 401 });
  if (!reviewAiSiap()) return Response.json({ error: 'ANTHROPIC_API_KEY belum diatur.' }, { status: 503 });
  waitUntil(prosesBerkasBaru(id).catch((e) => console.error('Review otomatis gagal', id, e)));
  return Response.json({ diterima: true, berkas_id: id }, { status: 202 });
}
