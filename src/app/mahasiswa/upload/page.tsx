import { wajibMahasiswa } from '@/lib/auth';
import { JENIS } from '@/lib/labels';
import { berkasMahasiswa } from '@/lib/service';
import { akunDrive } from '@/lib/google';
import { BerkasTable } from '@/components/BerkasTable';
import { UploadForm } from '../UploadForm';

export const metadata = { title: 'Upload Berkas' };

export default async function UploadPage() {
  const user = await wajibMahasiswa();
  const [daftar, drive] = await Promise.all([berkasMahasiswa(user.id), akunDrive()]);
  const versiBerikut = Object.fromEntries(
    JENIS.map((j) => [j.id, Math.max(0, ...daftar.filter((b) => b.jenis === j.id).map((b) => b.versi)) + 1]),
  );
  return (
    <>
      <h1 className="h3 mb-4">Upload Berkas</h1>
      <div className="row g-4">
        <div className="col-lg-5"><UploadForm versiBerikut={versiBerikut} driveSiap={!!drive} /></div>
        <div className="col-lg-7">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Berkas saya</span>
              <span className="small text-body-secondary">Klik berkas untuk melihat revisi</span>
            </div>
            <BerkasTable rows={daftar} hrefBase="/mahasiswa/berkas" />
          </div>
        </div>
      </div>
    </>
  );
}
