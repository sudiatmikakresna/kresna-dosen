import { jalankanReviewHarian, reviewAiSiap } from '@/lib/review-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Dipanggil Vercel Cron setiap pagi (lihat vercel.json). Vercel mengirim Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Tidak diizinkan.' }, { status: 401 });
  }
  if (!reviewAiSiap()) return Response.json({ error: 'ANTHROPIC_API_KEY belum diatur.' }, { status: 503 });
  const r = await jalankanReviewHarian();
  return Response.json({
    diproses: r.hasil.length,
    sisa: r.sisa,
    whatsapp: r.whatsapp,
    hasil: r.hasil.map((h) => ({ berkas_id: h.berkasId, status: h.status, keputusan: h.keputusan, alasan: h.alasan })),
  });
}
