import Link from 'next/link';
import type { Berkas } from '@/db';
import { labelJenis, tanggal } from '@/lib/labels';
import { StatusBadge } from './StatusBadge';

export function BerkasTable({ rows, hrefBase, revisiCount }: {
  rows: Berkas[]; hrefBase: string; revisiCount?: Record<number, number>;
}) {
  if (!rows.length) return <div className="card-body text-body-secondary">Belum ada berkas.</div>;
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th scope="col">Berkas</th>
            <th scope="col">Versi</th>
            <th scope="col">Dikirim</th>
            {revisiCount && <th scope="col">Revisi</th>}
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>
                <Link href={`${hrefBase}/${b.id}`} className="fw-semibold text-decoration-none">{labelJenis(b.jenis)}</Link>
                <div className="small text-body-secondary font-monospace">
                  {b.sumber === 'gdocs' ? 'Google Docs' : b.fileName}
                </div>
              </td>
              <td className="font-monospace">v{b.versi}</td>
              <td className="small">{tanggal(b.createdAt)}</td>
              {revisiCount && <td className="small">{revisiCount[b.id] ? `${revisiCount[b.id]} catatan` : '—'}</td>}
              <td><StatusBadge s={b.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
