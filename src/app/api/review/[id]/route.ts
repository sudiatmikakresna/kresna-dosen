import { waitUntil } from '@vercel/functions';
import { rahasiaReviewValid } from '@/lib/picu-review';
import { prosesBerkasBaru, reviewAiSiap } from '@/lib/review-ai';

export const dynamic = 'force-dynamic';
// Review satu berkas (unduh PDF + Claude API) bisa memakan beberapa menit.
export const maxDuration = 300;

/** Dipicu otomatis setelah mahasiswa mengunggah berkas. Langsung membalas 202; review berjalan di latar. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rahasiaReviewValid(req.headers.get('authorization'))) return Response.json({ error: 'Tidak diizinkan.' }, { status: 401 });
  if (!reviewAiSiap()) return Response.json({ error: 'ANTHROPIC_API_KEY belum diatur.' }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'ID berkas tidak valid.' }, { status: 400 });
  waitUntil(prosesBerkasBaru(id).catch((e) => console.error('Review otomatis gagal', id, e)));
  return Response.json({ diterima: true, berkas_id: id }, { status: 202 });
}
