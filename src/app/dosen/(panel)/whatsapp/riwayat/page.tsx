import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, waGrup } from '@/db';
import { wajibDosen } from '@/lib/auth';
import { waktu } from '@/lib/labels';
import { riwayatPesan, wahaSiap, type PesanChat } from '@/lib/waha';

export const metadata = { title: 'Riwayat Grup WhatsApp' };

const LANGKAH = 100;
const MAKS = 500;

export default async function RiwayatGrupPage({ searchParams }: { searchParams: Promise<{ grup?: string; batas?: string }> }) {
  await wajibDosen();
  const { grup, batas: batasTeks } = await searchParams;
  // Hanya grup tujuan laporan yang boleh dibaca, supaya halaman ini tidak bisa membuka chat lain di nomor yang sama.
  const [g] = grup ? await db().select().from(waGrup).where(and(eq(waGrup.chatId, grup), eq(waGrup.diizinkan, true))).limit(1) : [];
  if (!g) notFound();
  const batas = Math.min(Math.max(Number(batasTeks) || LANGKAH, 1), MAKS);

  let pesan: PesanChat[] = [];
  let error: string | null = null;
  if (!wahaSiap()) {
    error = 'WAHA_URL atau WAHA_API_KEY belum diatur di Vercel.';
  } else {
    try {
      pesan = await riwayatPesan(g.chatId, batas);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const mungkinAdaLagi = pesan.length >= batas && batas < MAKS;

  return (
    <>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item"><Link href="/dosen/whatsapp">WhatsApp</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Riwayat grup</li>
        </ol>
      </nav>
      <h1 className="h3 mb-1">{g.nama ?? 'Grup tanpa nama'}</h1>
      <p className="text-body-secondary small mb-4">
        Pesan dibaca langsung dari WAHA di laptop dan tidak disimpan di aplikasi. Riwayat hanya tersedia sejak nomor ditautkan ke WAHA,
        dan hanya bisa dibuka saat laptop, WAHA, dan tunnel menyala.
      </p>

      {error ? (
        <div className="alert alert-danger">
          Gagal membaca pesan dari WAHA. Pastikan laptop menyala, WAHA dan Cloudflare Tunnel berjalan.
          <div className="mt-1 text-break small">{error}</div>
        </div>
      ) : pesan.length === 0 ? (
        <div className="alert alert-secondary">Belum ada pesan yang tersimpan di WAHA untuk grup ini.</div>
      ) : (
        <div className="card">
          <div className="card-header fw-semibold">{pesan.length} pesan terakhir · terbaru di atas</div>
          <ul className="list-group list-group-flush">
            {pesan.map((p) => (
              <li key={p.id} className="list-group-item">
                <div className="d-flex flex-wrap align-items-baseline gap-2 mb-1">
                  <span className="fw-semibold">{p.dariSaya ? 'Nomor ini' : p.pengirim ?? 'Anggota grup'}</span>
                  {p.dariSaya && <span className="badge text-bg-success">Terkirim dari WAHA atau HP Anda</span>}
                  <span className="small text-body-secondary">{waktu(p.waktu)}</span>
                </div>
                {p.teks && <div className="text-break" style={{ whiteSpace: 'pre-wrap' }}>{p.teks}</div>}
                {p.lampiran && <div className="small text-body-secondary">[lampiran: buka di WhatsApp]</div>}
                {!p.teks && !p.lampiran && <div className="small text-body-secondary">[pesan tanpa teks]</div>}
              </li>
            ))}
          </ul>
          {mungkinAdaLagi && (
            <div className="card-footer">
              <Link href={`/dosen/whatsapp/riwayat?grup=${encodeURIComponent(g.chatId)}&batas=${Math.min(batas + LANGKAH, MAKS)}`} className="btn btn-sm btn-outline-primary">
                Muat lebih lama
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
