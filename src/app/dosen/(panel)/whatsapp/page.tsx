import { desc } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db, waGrup, waTanya } from '@/db';
import { aturBotWa, hapusGrupWa, izinkanGrupWa, simpanPengetahuanWa } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { waktu } from '@/lib/labels';
import { KUNCI_AKTIF, KUNCI_PENGETAHUAN, MAKS_PENGETAHUAN, ambilPengaturan } from '@/lib/wa-bot';
import { statusSesi, wahaSiap } from '@/lib/waha';

export const metadata = { title: 'WhatsApp' };

const STATUS_TANYA: Record<string, [string, string]> = {
  dijawab: ['Dijawab', 'text-bg-success'],
  diproses: ['Diproses', 'text-bg-secondary'],
  diabaikan: ['Diabaikan', 'text-bg-light border'],
  dibatasi: ['Dibatasi', 'text-bg-warning'],
  gagal: ['Gagal', 'text-bg-danger'],
};

function Cek({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="d-flex gap-2 align-items-start">
      <span className={`badge ${ok ? 'text-bg-success' : 'text-bg-danger'}`}>{ok ? 'OK' : 'Belum'}</span>
      <span>{children}</span>
    </li>
  );
}

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ disimpan?: string }> }) {
  const { disimpan } = await searchParams;
  const h = await headers();
  const origin = (process.env.APP_URL ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`).replace(/\/$/, '');
  const [sesi, aktif, pengetahuan, grup, riwayat] = await Promise.all([
    wahaSiap() ? statusSesi() : Promise.resolve(null),
    ambilPengaturan(KUNCI_AKTIF),
    ambilPengaturan(KUNCI_PENGETAHUAN),
    db().select().from(waGrup).orderBy(desc(waGrup.terakhirAt)),
    db().select().from(waTanya).orderBy(desc(waTanya.createdAt)).limit(30),
  ]);
  const botAktif = aktif !== '0';
  const env = {
    WAHA_URL: !!process.env.WAHA_URL,
    WAHA_API_KEY: !!process.env.WAHA_API_KEY,
    WA_WEBHOOK_SECRET: !!process.env.WA_WEBHOOK_SECRET,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1">Bot WhatsApp</h1>
          <p className="text-body-secondary small mb-0">
            Mahasiswa bertanya di grup dengan <code>/tanya …</code>, menyebut nomor bot, atau membalas pesan bot. Claude menjawab di grup
            memakai panduan aplikasi dan informasi yang Anda isi di bawah.
          </p>
        </div>
        <form action={aturBotWa.bind(null, !botAktif)}>
          <SubmitButton className={`btn ${botAktif ? 'btn-outline-danger' : 'btn-success'}`}>{botAktif ? 'Matikan bot' : 'Aktifkan bot'}</SubmitButton>
        </form>
      </div>
      {disimpan && <div className="alert alert-success">Informasi untuk bot disimpan.</div>}

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header fw-semibold d-flex justify-content-between">
              <span>Status</span>
              <span className={`badge ${botAktif ? 'text-bg-success' : 'text-bg-secondary'}`}>{botAktif ? 'Bot aktif' : 'Bot dimatikan'}</span>
            </div>
            <div className="card-body small">
              <ul className="list-unstyled d-grid gap-2 mb-3">
                <Cek ok={env.WAHA_URL && env.WAHA_API_KEY}>
                  <code>WAHA_URL</code> (alamat Cloudflare Tunnel) dan <code>WAHA_API_KEY</code> di Vercel
                </Cek>
                <Cek ok={env.WA_WEBHOOK_SECRET}>
                  <code>WA_WEBHOOK_SECRET</code> di Vercel, sama dengan <code>WHATSAPP_HOOK_HMAC_KEY</code> di WAHA
                </Cek>
                <Cek ok={env.ANTHROPIC_API_KEY}>
                  <code>ANTHROPIC_API_KEY</code> di Vercel
                </Cek>
                <Cek ok={sesi?.status === 'WORKING'}>
                  Sesi WhatsApp di WAHA:{' '}
                  {!sesi ? 'belum bisa dicek' : sesi.error ? <>tidak terjangkau ({sesi.error})</> : <><strong>{sesi.status}</strong>{sesi.me ? ` · ${sesi.me.pushName ?? ''} ${sesi.me.id}` : ''}</>}
                </Cek>
              </ul>
              <div className="mb-1">Isi di <code>waha/.env</code> lalu jalankan ulang WAHA:</div>
              <pre className="bg-body-tertiary border rounded p-2 mb-0 small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`WHATSAPP_HOOK_URL=${origin}/api/wa/webhook
WHATSAPP_HOOK_EVENTS=message
WHATSAPP_HOOK_HMAC_KEY=<isi sama dengan WA_WEBHOOK_SECRET>`}
              </pre>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header fw-semibold">Grup</div>
            {grup.length === 0 ? (
              <div className="card-body small text-body-secondary">
                Belum ada grup. Masukkan nomor bot ke grup bimbingan, lalu kirim <code>/tanya halo</code> di grup itu. Grup akan muncul di sini
                untuk Anda izinkan; sebelum diizinkan, bot diam.
              </div>
            ) : (
              <ul className="list-group list-group-flush">
                {grup.map((g) => (
                  <li key={g.chatId} className="list-group-item d-flex flex-wrap align-items-center gap-2">
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{g.nama ?? 'Grup tanpa nama'}</div>
                      <div className="small text-body-secondary font-monospace">{g.chatId} · aktif {waktu(g.terakhirAt)}</div>
                    </div>
                    <span className={`badge ${g.diizinkan ? 'text-bg-success' : 'text-bg-secondary'}`}>{g.diizinkan ? 'Diizinkan' : 'Belum diizinkan'}</span>
                    <form action={izinkanGrupWa.bind(null, g.chatId, !g.diizinkan)}>
                      <SubmitButton className={`btn btn-sm ${g.diizinkan ? 'btn-outline-secondary' : 'btn-primary'}`}>{g.diizinkan ? 'Cabut izin' : 'Izinkan'}</SubmitButton>
                    </form>
                    {!g.diizinkan && (
                      <form action={hapusGrupWa.bind(null, g.chatId)}>
                        <button className="btn btn-sm btn-outline-danger">Hapus</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="col-12">
          <div className="card">
            <div className="card-header fw-semibold">Informasi untuk bot</div>
            <div className="card-body">
              <p className="small text-body-secondary">
                Pedoman, jadwal bimbingan, tenggat, format penulisan, FAQ. Bot hanya menjawab soal aturan dan jadwal dari teks ini; jika tidak ada,
                bot menyarankan bertanya ke Anda dan meneruskan pertanyaannya ke Telegram. Jangan isi data pribadi mahasiswa.
              </p>
              <form action={simpanPengetahuanWa}>
                <label htmlFor="pengetahuan" className="visually-hidden">Informasi untuk bot</label>
                <textarea
                  id="pengetahuan"
                  name="pengetahuan"
                  className="form-control mb-2"
                  rows={10}
                  maxLength={MAKS_PENGETAHUAN}
                  defaultValue={pengetahuan ?? ''}
                  placeholder={'Contoh:\n- Bimbingan tatap muka setiap Kamis 13.00–15.00 di ruang dosen.\n- Format sitasi: APA edisi 7, minimal 15 rujukan, 80% terbit 5 tahun terakhir.\n- Bab 1–3 harus disetujui sebelum seminar proposal.'}
                />
                <SubmitButton>Simpan</SubmitButton>
              </form>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card">
            <div className="card-header fw-semibold">Pertanyaan terbaru</div>
            {riwayat.length === 0 ? (
              <div className="card-body small text-body-secondary">Belum ada pertanyaan.</div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th scope="col">Waktu</th>
                      <th scope="col">Penanya</th>
                      <th scope="col" style={{ minWidth: 220 }}>Pertanyaan</th>
                      <th scope="col" style={{ minWidth: 260 }}>Jawaban</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riwayat.map((t) => {
                      const [label, cls] = STATUS_TANYA[t.status] ?? [t.status, 'text-bg-secondary'];
                      return (
                        <tr key={t.id}>
                          <td className="text-nowrap">{waktu(t.createdAt)}</td>
                          <td>
                            <div>{t.namaPengirim ?? '—'}</div>
                            <div className="text-body-secondary font-monospace">{t.pengirim.split('@')[0]}</div>
                          </td>
                          <td style={{ whiteSpace: 'pre-wrap' }}>{t.pertanyaan}</td>
                          <td style={{ whiteSpace: 'pre-wrap' }}>{t.jawaban ?? <span className="text-body-secondary">{t.alasan ?? '—'}</span>}</td>
                          <td>
                            <span className={`badge ${cls}`}>{label}</span>
                            {t.perluDosen && <span className="badge text-bg-warning ms-1">Perlu dosen</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
