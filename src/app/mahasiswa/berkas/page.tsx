import { wajibMahasiswa } from '@/lib/auth';
import { berkasMahasiswa } from '@/lib/service';
import { BerkasTable } from '@/components/BerkasTable';

export const metadata = { title: 'Berkas & Revisi' };

export default async function BerkasSaya() {
  const user = await wajibMahasiswa();
  const daftar = await berkasMahasiswa(user.id);
  return (
    <>
      <h1 className="h3 mb-4">Berkas &amp; Revisi</h1>
      <div className="card">
        <div className="card-header small text-body-secondary">Klik berkas untuk membuka pratinjau dan revisi dari dosen.</div>
        <BerkasTable rows={daftar} hrefBase="/mahasiswa/berkas" />
      </div>
    </>
  );
}
