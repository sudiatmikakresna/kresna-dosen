import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, waGrup } from '@/db';
import { aturBotGrup, pilihGrupWa, tambahGrupWaManual, tesGrupWa } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { waktu } from '@/lib/labels';
import { daftarGrup, statusSesi, wahaSiap } from '@/lib/waha';
import { ringkasanPesan, webhookSiap } from '@/lib/wa-pesan';

export const metadata = { title: 'WhatsApp' };

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const siap = wahaSiap();
  const sesi = siap ? await statusSesi() : null;
  const tersimpan = await db().select().from(waGrup).orderBy(desc(waGrup.diizinkan), desc(waGrup.terakhirAt));
  let dariWaha: { id: string; nama: string | null }[] = [];
  let errorDaftar: string | null = null;
  if (sesi?.status === 'WORKING') {
    try {
      dariWaha = await daftarGrup();
    } catch (e) {
      errorDaftar = (e as Error).message;
    }
  }
  const status = new Map(tersimpan.map((g) => [g.chatId, g]));
  const semua = [
    ...tersimpan.map((g) => ({ id: g.chatId, nama: g.nama, tujuan: g.diizinkan, bot: g.botAktif, terakhir: g.terakhirAt })),
    ...dariWaha.filter((g) => !status.has(g.id)).map((g) => ({ id: g.id, nama: g.nama, tujuan: false, bot: false, terakhir: null })),
  ];
  const adaTujuan = tersimpan.some((g) => g.diizinkan);
  const pesanMasuk = await ringkasanPesan();

  return (
    <>
      <h1 className="h3 mb-1">Laporan ke grup WhatsApp</h1>
      <p className="text-body-secondary small mb-4">
        Setiap kali <code>/review-skripsi</code> (atau review harian otomatis) selesai mengirim revisi, ringkasannya diumumkan ke grup yang
        Anda pilih: nama mahasiswa, bab dan versi, serta keputusannya. NIM dan isi catatan tidak dikirim ke grup.
      </p>
      {ok === 'tes' && <div className="alert alert-success">Pesan tes terkirim ke grup tujuan.</div>}
      {ok === 'grup' && <div className="alert alert-success">Grup ditambahkan sebagai tujuan laporan.</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card">
            <div className="card-header fw-semibold">Status WAHA</div>
            <div className="card-body small">
              {!siap ? (
                <div className="alert alert-warning mb-0">
                  Atur <code>WAHA_URL</code> (alamat WAHA, mis. https://waha.kresna.blog) dan <code>WAHA_API_KEY</code> di environment variable Vercel, lalu
                  redeploy.
                </div>
              ) : sesi?.error ? (
                <div className="alert alert-danger mb-0">
                  WAHA tidak terjangkau. Pastikan WAHA di VPS berjalan dan <code>WAHA_URL</code> serta <code>WAHA_API_KEY</code> benar.
                  <div className="mt-1 text-break">{sesi.error}</div>
                </div>
              ) : (
                <>
                  <p className="mb-2">
                    Sesi WhatsApp: <strong>{sesi?.status}</strong>
                    {sesi?.me && <span className="text-body-secondary"> · {sesi.me.pushName} {sesi.me.id.split('@')[0]}</span>}
                  </p>
                  {sesi?.status !== 'WORKING' && <p className="text-danger mb-2">Buka dashboard WAHA dan scan QR sampai status WORKING.</p>}
                  <form action={tesGrupWa}>
                    <SubmitButton className="btn btn-outline-primary" pendingText="Mengirim…">Kirim pesan tes ke grup</SubmitButton>
                  </form>
                  {!adaTujuan && <p className="text-body-secondary mt-2 mb-0">Pilih minimal satu grup tujuan dulu.</p>}
                </>
              )}
            </div>
          </div>
          <div className="card mt-4">
            <div className="card-header fw-semibold">Webhook pesan grup</div>
            <div className="card-body small">
              {webhookSiap() ? (
                <p className="mb-2">
                  <span className="badge text-bg-success me-1">OK</span>
                  <code>WAHA_WEBHOOK_HMAC_KEY</code> diatur. {pesanMasuk.jumlah} pesan tersimpan
                  {pesanMasuk.terakhir ? <>, terakhir {waktu(pesanMasuk.terakhir)}</> : null}.
                </p>
              ) : (
                <p className="mb-2">
                  <span className="badge text-bg-warning me-1">Belum</span>
                  Atur <code>WAHA_WEBHOOK_HMAC_KEY</code> di Vercel, sama dengan <code>WHATSAPP_HOOK_HMAC_KEY</code> di WAHA.
                </p>
              )}
              <p className="text-body-secondary mb-0">
                WAHA mengirim setiap pesan ke <code>/api/whatsapp/webhook</code>. Hanya pesan dari grup tujuan yang disimpan; grup lain
                (mis. grup kelas) diabaikan. Riwayat dibaca dari database, jadi tetap ada walaupun WAHA dipindah atau di-reset.
              </p>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card">
            <div className="card-header fw-semibold d-flex justify-content-between align-items-center">
              <span>Grup</span>
              <Link href="/dosen/whatsapp/bot" className="small">Dokumen &amp; log bot tanya-jawab →</Link>
            </div>
            {errorDaftar && <div className="card-body small text-danger border-bottom">Gagal membaca daftar grup dari WAHA: {errorDaftar}</div>}
            {semua.length === 0 ? (
              <div className="card-body small text-body-secondary">
                Belum ada grup. Masukkan nomor bot ke grup bimbingan; grup akan muncul di sini saat WAHA tersambung.
              </div>
            ) : (
              <ul className="list-group list-group-flush">
                {semua.map((g) => (
                  <li key={g.id} className="list-group-item d-flex flex-wrap align-items-center gap-2">
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{g.nama ?? 'Grup tanpa nama'}</div>
                      <div className="small text-body-secondary font-monospace">
                        {g.id}
                        {g.tujuan && g.terakhir && <> · terakhir dikirim {waktu(g.terakhir)}</>}
                      </div>
                    </div>
                    {g.tujuan && <span className="badge text-bg-success">Tujuan laporan</span>}
                    {g.bot && <span className="badge text-bg-info">Bot tanya-jawab</span>}
                    {g.tujuan && (
                      <Link href={`/dosen/whatsapp/riwayat?grup=${encodeURIComponent(g.id)}`} className="btn btn-sm btn-outline-primary">
                        Lihat riwayat
                      </Link>
                    )}
                    <form action={aturBotGrup.bind(null, g.id, g.nama, !g.bot)}>
                      <SubmitButton className={`btn btn-sm ${g.bot ? 'btn-outline-secondary' : 'btn-outline-info'}`}>
                        {g.bot ? 'Matikan bot' : 'Aktifkan bot'}
                      </SubmitButton>
                    </form>
                    <form action={pilihGrupWa.bind(null, g.id, g.nama, !g.tujuan)}>
                      <SubmitButton className={`btn btn-sm ${g.tujuan ? 'btn-outline-secondary' : 'btn-primary'}`}>
                        {g.tujuan ? 'Berhenti kirim' : 'Jadikan tujuan'}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <div className="card-footer">
              <details>
                <summary className="small">Grup tidak muncul? Isi ID grup manual</summary>
                <form action={tambahGrupWaManual} className="d-flex flex-wrap gap-2 mt-2">
                  <label htmlFor="chatId" className="visually-hidden">ID grup</label>
                  <input id="chatId" name="chatId" className="form-control form-control-sm font-monospace" style={{ maxWidth: 300 }} placeholder="120363012345678901@g.us" required />
                  <SubmitButton className="btn btn-sm btn-outline-primary">Tambahkan</SubmitButton>
                </form>
                <p className="small text-body-secondary mt-2 mb-0">ID grup terlihat di dashboard WAHA (menu Chats) atau Swagger <code>GET /api/default/groups</code>.</p>
              </details>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
