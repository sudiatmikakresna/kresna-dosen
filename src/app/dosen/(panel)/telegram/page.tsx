import { chatTelegram, telegramSiap } from '@/lib/telegram';
import { deteksiTelegram, putuskanTelegramAksi, tesTelegram } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';

export const metadata = { title: 'Telegram' };

export default async function TelegramPage({ searchParams }: { searchParams: Promise<{ ok?: string; tes?: string; error?: string }> }) {
  const { ok, tes, error } = await searchParams;
  const siap = telegramSiap();
  const chat = siap ? await chatTelegram() : null;
  return (
    <>
      <h1 className="h3 mb-1">Notifikasi Telegram</h1>
      <p className="text-body-secondary small mb-4">Setiap kali mahasiswa mengunggah berkas atau mengirim link Google Docs, bot mengirim pesan ke Telegram Anda.</p>
      {ok && <div className="alert alert-success">Telegram terhubung. Cek pesan konfirmasi dari bot.</div>}
      {tes && <div className="alert alert-success">Pesan tes terkirim.</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card">
            <div className="card-header fw-semibold">Status</div>
            <div className="card-body">
              {!siap ? (
                <div className="alert alert-warning mb-0">
                  <code>TELEGRAM_BOT_TOKEN</code> belum diatur di environment variable Vercel.
                </div>
              ) : chat ? (
                <>
                  <p className="mb-3">Notifikasi dikirim ke <strong>{chat.nama}</strong> <span className="text-body-secondary small font-monospace">(chat ID {chat.id})</span>.</p>
                  <div className="d-flex flex-wrap gap-2">
                    <form action={tesTelegram}><SubmitButton className="btn btn-outline-primary">Kirim pesan tes</SubmitButton></form>
                    <form action={deteksiTelegram}><SubmitButton className="btn btn-outline-secondary">Deteksi ulang</SubmitButton></form>
                    <form action={putuskanTelegramAksi}><button className="btn btn-outline-danger">Matikan notifikasi</button></form>
                  </div>
                </>
              ) : (
                <>
                  <ol className="small">
                    <li>Buka bot Anda di Telegram, lalu tekan <strong>Start</strong> atau kirim pesan apa saja.</li>
                    <li>Klik tombol di bawah. Sistem mencari chat Anda dan mengirim pesan konfirmasi.</li>
                  </ol>
                  <form action={deteksiTelegram}><SubmitButton pendingText="Mencari chat…">Deteksi chat Telegram</SubmitButton></form>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card">
            <div className="card-header fw-semibold">Isi notifikasi</div>
            <div className="card-body small">
              <p className="mb-2">Nama dan NIM mahasiswa, jenis berkas dan versi, catatan dari mahasiswa, serta tautan untuk meninjau di aplikasi dan membuka file di Google Drive.</p>
              <p className="mb-0 text-body-secondary">Jika Telegram sedang gangguan, unggahan mahasiswa tetap berhasil; hanya notifikasinya yang terlewat.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
