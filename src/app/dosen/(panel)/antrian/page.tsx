import Link from 'next/link';
import { labelJenis, relatif } from '@/lib/labels';
import { antrianReview } from '@/lib/service';
import { StatusBadge } from '@/components/StatusBadge';

export const metadata = { title: 'Antrian Review' };

export default async function AntrianPage() {
  const rows = await antrianReview();
  return (
    <>
      <h1 className="h3 mb-1">Antrian Review</h1>
      <p className="text-body-secondary small mb-4">Berkas yang belum Anda kirim keputusannya, dari yang paling lama menunggu.</p>
      <div className="card">
        <div className="list-group list-group-flush">
          {rows.map((r) => (
            <Link key={r.id} href={`/dosen/berkas/${r.id}`} className="list-group-item list-group-item-action d-flex flex-wrap align-items-center gap-3 py-3">
              <div className="flex-grow-1">
                <div className="fw-semibold">{r.nama} <span className="small text-body-secondary font-monospace">{r.nim}</span></div>
                <div className="small">{labelJenis(r.jenis)} · versi {r.versi}</div>
              </div>
              <span className="small text-body-secondary">{relatif(r.createdAt)}</span>
              <StatusBadge s={r.status} />
            </Link>
          ))}
          {!rows.length && <div className="list-group-item text-body-secondary">Tidak ada berkas yang menunggu review.</div>}
        </div>
      </div>
    </>
  );
}
