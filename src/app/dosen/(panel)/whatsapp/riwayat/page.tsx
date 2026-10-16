import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, waGrup } from '@/db';
import { imporRiwayatWa } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { wajibDosen } from '@/lib/auth';
import { waktu } from '@/lib/labels';
import { pesanTersimpan, ringkasanPesan, webhookSiap } from '@/lib/wa-pesan';
import { wahaSiap } from '@/lib/waha';

export const metadata = { title: 'Riwayat Grup WhatsApp' };

const LANGKAH = 100;
const MAKS = 2000;

export default async function RiwayatGrupPage({
  searchParams,
}: {
  searchParams: Promise<{ grup?: string; batas?: string; impor?: string; dibaca?: string; error?: string }>;
}) {
  await wajibDosen();
  const { grup, batas: batasTeks, impor, dibaca, error } = await searchParams;
  // Hanya grup tujuan laporan yang boleh dibaca; pesan grup lain memang tidak disimpan.
  const [g] = grup ? await db().select().from(waGrup).where(and(eq(waGrup.chatId, grup), eq(waGrup.diizinkan, true))).limit(1) : [];
  if (!g) notFound();
  const batas = Math.min(Math.max(Number(batasTeks) || LANGKAH, 1), MAKS);

  const [pesan, ringkas] = await Promise.all([pesanTersimpan(g.chatId, batas), ringkasanPesan(g.chatId)]);
  const adaLagi = ringkas.jumlah > pesan.length && batas < MAKS;

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
        Pesan disimpan di database aplikasi saat WAHA mengirim webhook, jadi riwayat tetap ada walaupun WAHA dipindah atau di-reset.
        {ringkas.terakhir && <> Pesan terakhir diterima {waktu(ringkas.terakhir)}.</>}
      </p>

      {impor !== undefined && (
        <div className="alert alert-success">
          {Number(impor)} pesan baru disalin dari WAHA ({Number(dibaca) || 0} dibaca; sisanya sudah tersimpan).
        </div>
      )}
      {error && <div className="alert alert-danger text-break">{error}</div>}
      {!webhookSiap() && (
        <div className="alert alert-warning">
          <code>WAHA_WEBHOOK_HMAC_KEY</code> belum diatur di Vercel, jadi pesan baru belum bisa diterima. Panduan: <code>waha/README.md</code>.
        </div>
      )}

      {pesan.length === 0 ? (
        <div className="alert alert-secondary">Belum ada pesan tersimpan untuk grup ini.</div>
      ) : (
        <div className="card">
          <div className="card-header fw-semibold">
            {pesan.length} dari {ringkas.jumlah} pesan tersimpan · terbaru di atas
          </div>
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
          {adaLagi && (
            <div className="card-footer">
              <Link href={`/dosen/whatsapp/riwayat?grup=${encodeURIComponent(g.chatId)}&batas=${Math.min(batas + LANGKAH, MAKS)}`} className="btn btn-sm btn-outline-primary">
                Muat lebih lama
              </Link>
            </div>
          )}
        </div>
      )}

      {wahaSiap() && (
        <details className="mt-4">
          <summary className="small">Salin pesan lama dari WAHA</summary>
          <p className="small text-body-secondary mt-2">
            Untuk pesan yang masuk sebelum webhook aktif. Mengambil hingga 500 pesan terakhir yang masih ada di WAHA; pesan yang sudah
            tersimpan dilewati, jadi aman diulang.
          </p>
          <form action={imporRiwayatWa.bind(null, g.chatId)}>
            <SubmitButton className="btn btn-sm btn-outline-secondary" pendingText="Menyalin…">Salin dari WAHA</SubmitButton>
          </form>
        </details>
      )}
    </>
  );
}
