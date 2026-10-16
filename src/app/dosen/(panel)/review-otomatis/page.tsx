import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { berkas, db, reviewAi, users } from '@/db';
import { mulaiReviewAi } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { labelJenisPendek, waktu } from '@/lib/labels';
import { MAKS_PER_RUN, MODEL_REVIEW, reviewAiSiap } from '@/lib/review-ai';

export const metadata = { title: 'Review Otomatis' };
// Tombol "Review sekarang" menjalankan review di latar lewat server action halaman ini.
export const maxDuration = 300;

// Harga Claude Opus 5.5 per 1 juta token (USD), untuk perkiraan biaya saja.
const HARGA = { input: 4, output: 20, cacheRead: 0.2 };

const STATUS: Record<string, [string, string]> = {
  proses: ['Diproses', 'text-bg-secondary'],
  dikirim: ['Dikirim', 'text-bg-success'],
  draf: ['Draf (perlu keputusan)', 'text-bg-info'],
  dilewati: ['Dilewati', 'text-bg-light border'],
  gagal: ['Gagal', 'text-bg-danger'],
};

export default async function ReviewOtomatisPage({ searchParams }: { searchParams: Promise<{ mulai?: string; error?: string }> }) {
  const { mulai, error } = await searchParams;
  const siap = reviewAiSiap();
  const cronSiap = !!process.env.CRON_SECRET;
  const log = await db()
    .select({ r: reviewAi, jenis: berkas.jenis, versi: berkas.versi, fileName: berkas.fileName, nama: users.nama })
    .from(reviewAi)
    .innerJoin(berkas, eq(berkas.id, reviewAi.berkasId))
    .innerJoin(users, eq(users.id, berkas.mahasiswaId))
    .orderBy(desc(reviewAi.createdAt))
    .limit(30);
  const biaya = (r: typeof reviewAi.$inferSelect) =>
    ((r.inputTokens ?? 0) * HARGA.input + (r.outputTokens ?? 0) * HARGA.output + (r.cacheReadTokens ?? 0) * HARGA.cacheRead) / 1_000_000;
  const total30 = log.reduce((n, l) => n + biaya(l.r), 0);

  return (
    <>
      <h1 className="h3 mb-1">Review otomatis (Claude API)</h1>
      <p className="text-body-secondary small mb-4">
        Setiap hari sekitar pukul 07.30 WITA, aplikasi mereview berkas di antrian langsung lewat Claude API ({MODEL_REVIEW}) dengan membaca PDF asli
        dari Google Drive, menerapkan aturan approve 70% per sub bab, lalu mengirim revisi ke mahasiswa, laporan ke Telegram, dan pengumuman
        ke grup WhatsApp. Maksimal {MAKS_PER_RUN} berkas per run.
      </p>
      {mulai && <div className="alert alert-success">Review dimulai. Hasilnya muncul di tabel di bawah dan dikirim ke Telegram dalam beberapa menit.</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header fw-semibold">Status</div>
            <div className="card-body small">
              <ul className="list-unstyled d-grid gap-2 mb-3">
                <li>
                  <span className={`badge me-2 ${siap ? 'text-bg-success' : 'text-bg-danger'}`}>{siap ? 'OK' : 'Belum'}</span>
                  <code>ANTHROPIC_API_KEY</code> di Vercel
                </li>
                <li>
                  <span className={`badge me-2 ${cronSiap ? 'text-bg-success' : 'text-bg-danger'}`}>{cronSiap ? 'OK' : 'Belum'}</span>
                  <code>CRON_SECRET</code> di Vercel (untuk jadwal harian)
                </li>
              </ul>
              <form action={mulaiReviewAi}>
                <SubmitButton pendingText="Memulai…" className={`btn ${siap ? 'btn-primary' : 'btn-secondary'}`}>Review antrian sekarang</SubmitButton>
              </form>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header fw-semibold">Perkiraan biaya</div>
            <div className="card-body small">
              <div className="fs-4 fw-semibold">${total30.toFixed(2)}</div>
              <div className="text-body-secondary">untuk {log.length} review terakhir (harga Opus 5.5: $4 input, $20 output per 1 juta token). Tagihan resmi ada di platform.claude.com.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header fw-semibold">Riwayat review</div>
        {log.length === 0 ? (
          <div className="card-body small text-body-secondary">Belum ada review otomatis.</div>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle mb-0 small">
              <thead className="table-light">
                <tr>
                  <th scope="col">Waktu</th>
                  <th scope="col">Mahasiswa · berkas</th>
                  <th scope="col">Status</th>
                  <th scope="col">Catatan</th>
                  <th scope="col">Token (in/out)</th>
                  <th scope="col">Biaya</th>
                  <th scope="col">Durasi</th>
                </tr>
              </thead>
              <tbody>
                {log.map(({ r, jenis, versi, fileName, nama }) => {
                  const [label, cls] = STATUS[r.status] ?? [r.status, 'text-bg-secondary'];
                  return (
                    <tr key={r.id}>
                      <td className="text-nowrap">{waktu(r.createdAt)}</td>
                      <td>
                        <Link href={`/dosen/berkas/${r.berkasId}`}>{nama}</Link>
                        <div className="text-body-secondary">{jenis === 'lainnya' ? fileName : `${labelJenisPendek(jenis)} v${versi}`}</div>
                      </td>
                      <td>
                        <span className={`badge ${cls}`}>{label}</span>
                        {r.keputusan && <div>{r.keputusan === 'disetujui' ? 'Disetujui' : 'Perlu revisi'}</div>}
                        {r.alasan && <div className="text-body-secondary">{r.alasan}</div>}
                      </td>
                      <td>{r.jumlahCatatan ?? '—'}</td>
                      <td className="font-monospace text-nowrap">{r.inputTokens != null ? `${r.inputTokens.toLocaleString('id-ID')} / ${(r.outputTokens ?? 0).toLocaleString('id-ID')}` : '—'}</td>
                      <td className="text-nowrap">{r.inputTokens != null ? `$${biaya(r).toFixed(3)}` : '—'}</td>
                      <td className="text-nowrap">{r.durasiMs != null ? `${Math.round(r.durasiMs / 1000)} dtk` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
