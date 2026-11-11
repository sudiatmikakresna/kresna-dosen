import { GantiPassword } from './GantiPassword';

export const metadata = { title: 'Akun' };

export default function AkunPage() {
  return (
    <>
      <h1 className="h3 mb-1">Akun dosen</h1>
      <p className="text-body-secondary small mb-4">Setelah password diganti, semua sesi dosen keluar dan Anda masuk ulang dengan password baru.</p>
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-header fw-semibold">Ganti password</div>
        <div className="card-body">
          <GantiPassword />
        </div>
      </div>
    </>
  );
}
