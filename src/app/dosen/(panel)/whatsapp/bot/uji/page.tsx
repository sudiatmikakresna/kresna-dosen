import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { botUji, db, waGrup } from '@/db';
import { hapusUjiBot, jalankanUjiBot, tambahUjiBot } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { waktu } from '@/lib/labels';
import { CobaTanya } from './CobaTanya';

export const metadata = { title: 'Uji bot WhatsApp' };
// Kasus uji dijalankan berurutan di latar setelah tombol ditekan.
export const maxDuration = 300;

export default async function UjiBotPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [kasus, grup] = await Promise.all([
    db().select().from(botUji).orderBy(asc(botUji.id)),
    db().select({ chatId: waGrup.chatId, nama: waGrup.nama }).from(waGrup).where(eq(waGrup.botAktif, true)),
  ]);
  const daftarGrup = grup.map((g) => ({ chatId: g.chatId, nama: g.nama ?? g.chatId }));
  const namaGrup = new Map(daftarGrup.map((g) => [g.chatId, g.nama]));
  const selesai = kasus.filter((k) => k.lulus !== null);
  const lulus = selesai.filter((k) => k.lulus).length;
  const berjalan = kasus.some((k) => k.hasilStatus === 'berjalan');
  const biaya = kasus.reduce((n, k) => n + (k.biayaUsd ?? 0), 0) / 1_000_000;

  return (
    <>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item"><Link href="/dosen/whatsapp">WhatsApp</Link></li>
          <li className="breadcrumb-item"><Link href="/dosen/whatsapp/bot">Bot tanya-jawab</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Uji bot</li>
        </ol>
      </nav>
      <h1 className="h3 mb-1">Uji bot tanpa WhatsApp</h1>
      <p className="text-body-secondary small mb-4">
        Kasus uji dijalankan ke Claude sungguhan dengan dokumen, data, model, dan sumber grup yang sama seperti di WhatsApp, tetapi tanpa
        mengirim pesan. Permintaan aksi (presensi, persetujuan, kirim revisi, setujui bab) hanya ditampilkan sebagai pratinjau rencana dan tidak pernah dijalankan. Jalankan setelah mengubah dokumen, model, atau sumber grup untuk memastikan bot
        tetap menolak pertanyaan di luar topik dan tetap menjawab yang seharusnya.
      </p>
      {ok && <div className="alert alert-success">{ok}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="fw-semibold">
                Kasus uji ({kasus.length}){selesai.length > 0 && <> · lulus {lulus}/{selesai.length}</>}
                {biaya > 0 && <span className="text-body-secondary fw-normal"> · run terakhir ±${biaya.toFixed(3)}</span>}
              </span>
              <form action={jalankanUjiBot}>
                <SubmitButton
                  className="btn btn-sm btn-primary"
                  pendingText="Memulai…"
                  confirm={`Jalankan ${kasus.length} kasus uji ke Claude? Perkiraan biaya ±$${(kasus.length * 0.02).toFixed(2)}.`}
                >
                  {berjalan ? 'Sedang berjalan… jalankan ulang' : 'Jalankan semua'}
                </SubmitButton>
              </form>
            </div>
            {kasus.length === 0 ? (
              <div className="card-body small text-body-secondary">Belum ada kasus uji.</div>
            ) : (
              <ul className="list-group list-group-flush small">
                {kasus.map((k) => (
                  <li key={k.id} className="list-group-item">
                    <div className="d-flex flex-wrap justify-content-between gap-2">
                      <div>
                        <strong>{k.pertanyaan}</strong>
                        <div className="text-body-secondary">
                          Harapan: {k.harapan === 'ditolak' ? 'ditolak' : 'dijawab'}
                          {k.mengandung && <> dan memuat &quot;{k.mengandung}&quot;</>} · {k.chatId ? namaGrup.get(k.chatId) ?? k.chatId : 'semua sumber'}
                        </div>
                      </div>
                      <div className="d-flex align-items-start gap-2">
                        {k.hasilStatus === 'berjalan' ? (
                          <span className="badge text-bg-secondary">Berjalan…</span>
                        ) : k.lulus === null ? (
                          <span className="badge text-bg-light border">Belum dijalankan</span>
                        ) : (
                          <span className={`badge ${k.lulus ? 'text-bg-success' : 'text-bg-danger'}`}>{k.lulus ? 'Lulus' : 'Gagal'}</span>
                        )}
                        <form action={hapusUjiBot.bind(null, k.id)}>
                          <button className="btn btn-sm btn-link text-danger p-0">Hapus</button>
                        </form>
                      </div>
                    </div>
                    {k.hasilJawaban && k.hasilStatus !== 'berjalan' && (
                      <details className="mt-1">
                        <summary className="text-body-secondary">
                          Jawaban ({k.hasilStatus === 'dijawab' ? 'dijawab' : k.hasilStatus === 'di_luar_topik' ? 'ditolak' : k.hasilStatus}) · {waktu(k.dijalankanAt)}
                        </summary>
                        <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{k.hasilJawaban}</div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card mb-4">
            <div className="card-header fw-semibold">Coba satu pertanyaan</div>
            <div className="card-body">
              <CobaTanya grup={daftarGrup} />
            </div>
          </div>

          <div className="card">
            <div className="card-header fw-semibold">Tambah kasus uji</div>
            <div className="card-body small">
              <form action={tambahUjiBot}>
                <label htmlFor="pertanyaan" className="form-label">Pertanyaan</label>
                <textarea id="pertanyaan" name="pertanyaan" rows={2} className="form-control form-control-sm mb-2" required />
                <label htmlFor="harapan" className="form-label">Harapan</label>
                <select id="harapan" name="harapan" className="form-select form-select-sm mb-2">
                  <option value="dijawab">Dijawab</option>
                  <option value="ditolak">Ditolak (di luar topik)</option>
                </select>
                <label htmlFor="mengandung" className="form-label">Jawaban harus memuat (opsional)</label>
                <input id="mengandung" name="mengandung" className="form-control form-control-sm mb-2" placeholder="mis. 30 November" />
                <label htmlFor="chatId" className="form-label">Sebagai grup</label>
                <select id="chatId" name="chatId" className="form-select form-select-sm mb-2">
                  <option value="">Semua sumber, tanpa grup</option>
                  {daftarGrup.map((g) => (
                    <option key={g.chatId} value={g.chatId}>{g.nama}</option>
                  ))}
                </select>
                <SubmitButton className="btn btn-sm btn-primary">Tambah</SubmitButton>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
