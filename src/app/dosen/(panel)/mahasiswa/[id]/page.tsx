import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, users } from '@/db';
import { labelJenisPendek, status, waktu } from '@/lib/labels';
import { aktivitasMahasiswa, berkasMahasiswa, tahapDari } from '@/lib/service';
import { BerkasTable } from '@/components/BerkasTable';
import { StatusBadge } from '@/components/StatusBadge';

export const metadata = { title: 'Riwayat Mahasiswa' };

export default async function RiwayatMahasiswa({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [m] = await db().select().from(users).where(eq(users.id, id)).limit(1);
  if (!m || m.role !== 'mahasiswa') notFound();
  const [daftar, log] = await Promise.all([berkasMahasiswa(id), aktivitasMahasiswa(id, 30)]);
  const tahap = tahapDari(daftar);
  return (
    <>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item"><Link href="/dosen">Mahasiswa</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{m.nama}</li>
        </ol>
      </nav>
      <h1 className="h3 mb-1">{m.nama}</h1>
      <div className="text-body-secondary small mb-4"><span className="font-monospace">{m.nim}</span> · {m.judulSkripsi ?? 'Judul skripsi belum diisi'}</div>

      <div className="card mb-4">
        <div className="card-header fw-semibold">Kemajuan per tahap</div>
        <div className="card-body">
          <div className="row row-cols-2 row-cols-md-4 g-2">
            {tahap.map((t) => (
              <div className="col" key={t.jenis}>
                <div className="border p-2 h-100">
                  <div className="progress mb-2" style={{ height: 6 }}><div className={`progress-bar ${status(t.status).bar}`} style={{ width: '100%' }} /></div>
                  <div className="fw-semibold small">{labelJenisPendek(t.jenis)}</div>
                  <StatusBadge s={t.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card">
            <div className="card-header fw-semibold">Semua berkas</div>
            <BerkasTable rows={daftar} hrefBase="/dosen/berkas" />
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card">
            <div className="card-header fw-semibold">Riwayat bimbingan</div>
            <ul className="list-group list-group-flush">
              {log.map((e) => (
                <li className="list-group-item" key={e.id}>
                  <div className="small">{e.teks}</div>
                  <div className="small text-body-secondary">{waktu(e.createdAt)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
