import { akunDrive, googleSiap } from '@/lib/google';
import { tanggal } from '@/lib/labels';
import { putuskanDrive } from '@/app/dosen/actions';

export const metadata = { title: 'Google Drive' };

export default async function DrivePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const akun = await akunDrive();
  const siap = googleSiap();
  return (
    <>
      <h1 className="h3 mb-1">Google Drive</h1>
      <p className="text-body-secondary small mb-4">Semua berkas mahasiswa disimpan di Google Drive Anda, satu folder per mahasiswa.</p>
      {ok && <div className="alert alert-success">Google Drive berhasil dihubungkan.</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card">
            <div className="card-header fw-semibold">Status koneksi</div>
            <div className="card-body">
              {!siap ? (
                <div className="alert alert-warning mb-0">
                  <code>GOOGLE_CLIENT_ID</code> dan <code>GOOGLE_CLIENT_SECRET</code> belum diatur di environment variable Vercel.
                </div>
              ) : akun ? (
                <>
                  <dl className="row small mb-3">
                    <dt className="col-sm-4 text-body-secondary fw-normal">Akun</dt>
                    <dd className="col-sm-8 fw-semibold">{akun.email}</dd>
                    <dt className="col-sm-4 text-body-secondary fw-normal">Folder utama</dt>
                    <dd className="col-sm-8">
                      <a href={`https://drive.google.com/drive/folders/${akun.rootFolderId}`} target="_blank" rel="noreferrer">Bimbingan Skripsi</a>
                    </dd>
                    <dt className="col-sm-4 text-body-secondary fw-normal">Terhubung sejak</dt>
                    <dd className="col-sm-8 mb-0">{tanggal(akun.createdAt)}</dd>
                  </dl>
                  <div className="d-flex flex-wrap gap-2">
                    <a href="/api/google/hubungkan" className="btn btn-outline-primary">Hubungkan ulang</a>
                    <form action={putuskanDrive}><button className="btn btn-outline-danger">Putuskan</button></form>
                  </div>
                </>
              ) : (
                <>
                  <p>Belum terhubung. Mahasiswa belum bisa mengunggah berkas sampai Google Drive dihubungkan.</p>
                  <a href="/api/google/hubungkan" className="btn btn-primary">Hubungkan Google Drive</a>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card">
            <div className="card-header fw-semibold">Cara kerja</div>
            <ul className="list-group list-group-flush small">
              <li className="list-group-item">Izin yang diminta hanya <code>drive.file</code>: aplikasi hanya bisa melihat file yang dibuatnya sendiri, bukan seluruh isi Drive Anda.</li>
              <li className="list-group-item">Struktur: <code>Bimbingan Skripsi / NIM - Nama / Bab 2 - v1 - berkas.pdf</code>.</li>
              <li className="list-group-item">Teks berkas juga disimpan di database supaya bisa dibaca agent lewat MCP.</li>
              <li className="list-group-item">Menghubungkan ulang dengan akun lain akan membuat folder <em>Bimbingan Skripsi</em> baru. Berkas lama tetap di akun sebelumnya.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
