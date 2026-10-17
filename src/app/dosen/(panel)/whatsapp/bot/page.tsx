import Link from 'next/link';
import { asc, desc, eq } from 'drizzle-orm';
import { botDokumen, botTanya, db, waGrup } from '@/db';
import { aturDokumenBot, hapusDokumenBot, tambahDokumenBot } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { waktu } from '@/lib/labels';
import { BATAS_KARAKTER_DOKUMEN, MODEL_BOT, botSiap } from '@/lib/bot-wa';
import { webhookSiap } from '@/lib/wa-pesan';

export const metadata = { title: 'Bot tanya-jawab WhatsApp' };

// Harga Claude Opus 5.5 per 1 juta token (USD), untuk perkiraan biaya saja.
const HARGA = { input: 4, output: 20, cacheRead: 0.2 };

const STATUS: Record<string, [string, string]> = {
  diproses: ['Diproses', 'text-bg-secondary'],
  dijawab: ['Dijawab', 'text-bg-success'],
  di_luar_topik: ['Di luar dokumen', 'text-bg-warning'],
  dibatasi: ['Dibatasi', 'text-bg-light border'],
  gagal: ['Gagal', 'text-bg-danger'],
};

export default async function BotPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [dokumen, grup, log] = await Promise.all([
    db().select({ id: botDokumen.id, judul: botDokumen.judul, namaFile: botDokumen.namaFile, aktif: botDokumen.aktif, createdAt: botDokumen.createdAt, teks: botDokumen.teks }).from(botDokumen).orderBy(asc(botDokumen.id)),
    db().select().from(waGrup).where(eq(waGrup.botAktif, true)),
    db().select().from(botTanya).orderBy(desc(botTanya.createdAt)).limit(40),
  ]);
  const totalAktif = dokumen.filter((d) => d.aktif).reduce((n, d) => n + d.teks.length, 0);
  const namaGrup = new Map(grup.map((g) => [g.chatId, g.nama ?? g.chatId]));
  const biaya = (t: typeof botTanya.$inferSelect) =>
    ((t.inputTokens ?? 0) * HARGA.input + (t.outputTokens ?? 0) * HARGA.output + (t.cacheReadTokens ?? 0) * HARGA.cacheRead) / 1_000_000;

  return (
    <>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item"><Link href="/dosen/whatsapp">WhatsApp</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Bot tanya-jawab</li>
        </ol>
      </nav>
      <h1 className="h3 mb-1">Bot tanya-jawab WhatsApp</h1>
      <p className="text-body-secondary small mb-4">
        Di grup yang bot-nya aktif, anggota bisa menyebut (mention) nomor WhatsApp ini atau membalas pesan bot untuk bertanya. Claude ({MODEL_BOT})
        menjawab <strong>hanya berdasarkan dokumen aktif di bawah dan data riwayat bimbingan</strong> (progres semua mahasiswa: bab, versi,
        tanggal, keputusan, jumlah catatan, progres perbaikan; tanpa isi catatan dan NIM), lalu menyebut sumbernya. Pertanyaan di luar
        itu dijawab dengan penolakan sopan. Maksimal 5 pertanyaan per orang per 10 menit dan 100 per grup per hari.
      </p>
      {ok === 'dokumen' && <div className="alert alert-success">Dokumen ditambahkan dan langsung dipakai bot.</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card mb-4">
            <div className="card-header fw-semibold">Status</div>
            <ul className="list-group list-group-flush small">
              <li className="list-group-item"><span className={`badge me-2 ${botSiap() ? 'text-bg-success' : 'text-bg-danger'}`}>{botSiap() ? 'OK' : 'Belum'}</span><code>ANTHROPIC_API_KEY</code></li>
              <li className="list-group-item"><span className={`badge me-2 ${webhookSiap() ? 'text-bg-success' : 'text-bg-danger'}`}>{webhookSiap() ? 'OK' : 'Belum'}</span>Webhook WAHA (<code>WAHA_WEBHOOK_HMAC_KEY</code>)</li>
              <li className="list-group-item">
                <span className={`badge me-2 ${grup.length ? 'text-bg-success' : 'text-bg-warning'}`}>{grup.length}</span>
                grup dengan bot aktif{grup.length ? `: ${grup.map((g) => g.nama ?? g.chatId).join(', ')}` : ''}.{' '}
                <Link href="/dosen/whatsapp">Atur di halaman WhatsApp</Link>
              </li>
              <li className="list-group-item">
                <span className={`badge me-2 ${totalAktif ? 'text-bg-success' : 'text-bg-warning'}`}>{dokumen.filter((d) => d.aktif).length}</span>
                dokumen aktif, {totalAktif.toLocaleString('id-ID')} dari {BATAS_KARAKTER_DOKUMEN.toLocaleString('id-ID')} karakter
                (±{Math.round(totalAktif / 4).toLocaleString('id-ID')} token)
              </li>
            </ul>
          </div>

          <div className="card">
            <div className="card-header fw-semibold">Tambah dokumen</div>
            <div className="card-body">
              <form action={tambahDokumenBot}>
                <label htmlFor="judul" className="form-label small">Judul (disebut sebagai sumber jawaban)</label>
                <input id="judul" name="judul" className="form-control form-control-sm mb-2" placeholder="mis. Panduan Skripsi 2026" required maxLength={200} />
                <label htmlFor="file" className="form-label small">File PDF, DOCX, TXT, atau MD (maks. 4 MB)</label>
                <input id="file" name="file" type="file" accept=".pdf,.docx,.txt,.md" className="form-control form-control-sm mb-2" />
                <label htmlFor="teks" className="form-label small">…atau tempel isinya</label>
                <textarea id="teks" name="teks" rows={5} className="form-control form-control-sm mb-2" placeholder="Bila file diunggah, kolom ini diabaikan." />
                <SubmitButton className="btn btn-primary btn-sm" pendingText="Membaca dokumen…">Tambah dokumen</SubmitButton>
              </form>
              <p className="small text-body-secondary mt-2 mb-0">Jangan masukkan data pribadi mahasiswa: isi dokumen bisa dikutip bot di grup.</p>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card mb-4">
            <div className="card-header fw-semibold">Dokumen</div>
            {dokumen.length === 0 ? (
              <div className="card-body small text-body-secondary">Belum ada dokumen. Tanpa dokumen, bot hanya bisa menjawab pertanyaan riwayat bimbingan.</div>
            ) : (
              <ul className="list-group list-group-flush">
                {dokumen.map((d) => (
                  <li key={d.id} className="list-group-item d-flex flex-wrap align-items-center gap-2">
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{d.judul}</div>
                      <div className="small text-body-secondary">
                        {d.namaFile ?? 'teks ditempel'} · {d.teks.length.toLocaleString('id-ID')} karakter · {waktu(d.createdAt)}
                      </div>
                    </div>
                    <span className={`badge ${d.aktif ? 'text-bg-success' : 'text-bg-secondary'}`}>{d.aktif ? 'Aktif' : 'Nonaktif'}</span>
                    <form action={aturDokumenBot.bind(null, d.id, !d.aktif)}>
                      <SubmitButton className="btn btn-sm btn-outline-secondary">{d.aktif ? 'Nonaktifkan' : 'Aktifkan'}</SubmitButton>
                    </form>
                    <form action={hapusDokumenBot.bind(null, d.id)}>
                      <button className="btn btn-sm btn-outline-danger">Hapus</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-header fw-semibold">Pertanyaan terbaru</div>
            {log.length === 0 ? (
              <div className="card-body small text-body-secondary">Belum ada pertanyaan.</div>
            ) : (
              <ul className="list-group list-group-flush small">
                {log.map((t) => {
                  const [label, cls] = STATUS[t.status] ?? [t.status, 'text-bg-secondary'];
                  return (
                    <li key={t.id} className="list-group-item">
                      <div className="d-flex flex-wrap justify-content-between gap-2">
                        <span>
                          <strong>{t.pengirim ?? 'Anggota grup'}</strong> · {namaGrup.get(t.chatId) ?? t.chatId}
                        </span>
                        <span className="text-body-secondary">
                          {waktu(t.createdAt)}
                          {t.inputTokens != null && <> · ${biaya(t).toFixed(3)}</>}
                        </span>
                      </div>
                      <div className="mt-1">❓ {t.pertanyaan}</div>
                      {t.jawaban && <div className="mt-1 text-body-secondary" style={{ whiteSpace: 'pre-wrap' }}>💬 {t.jawaban}</div>}
                      <div className="mt-1">
                        <span className={`badge ${cls}`}>{label}</span>
                        {t.alasan && <span className="text-body-secondary ms-2">{t.alasan}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
