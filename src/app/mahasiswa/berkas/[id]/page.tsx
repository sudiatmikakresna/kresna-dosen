import Link from 'next/link';
import { notFound } from 'next/navigation';
import { wajibMahasiswa } from '@/lib/auth';
import { labelJenis, tanggal, waktu } from '@/lib/labels';
import { berkasMahasiswa, detailBerkas } from '@/lib/service';
import { Preview } from '@/components/Preview';
import { StatusBadge } from '@/components/StatusBadge';
import { IconRobot } from '@/components/icons';
import { RevisiCheck } from '../RevisiCheck';

export const metadata = { title: 'Detail Berkas' };

export default async function DetailBerkasMahasiswa({ params }: { params: Promise<{ id: string }> }) {
  const user = await wajibMahasiswa();
  const d = await detailBerkas(Number((await params).id));
  if (!d || d.berkas.mahasiswaId !== user.id) notFound();
  const b = d.berkas;
  const terkirim = d.revisi.filter((r) => r.status === 'dikirim');
  const selesai = terkirim.filter((r) => r.selesai).length;
  const pct = terkirim.length ? Math.round((selesai / terkirim.length) * 100) : 0;
  const lainnya = (await berkasMahasiswa(user.id)).filter((x) => x.jenis === b.jenis).sort((a, z) => z.versi - a.versi);
  const sudahDitanggapi = b.status === 'perlu_revisi' || b.status === 'disetujui' || (b.status === 'digantikan' && b.keputusanAt);

  return (
    <>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item"><Link href="/mahasiswa/berkas">Berkas saya</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{labelJenis(b.jenis)} · v{b.versi}</li>
        </ol>
      </nav>

      <div className="card mb-4">
        <div className="card-body d-flex flex-wrap gap-3 align-items-center justify-content-between">
          <div>
            <h1 className="h4 mb-1">{labelJenis(b.jenis)} <StatusBadge s={b.status} className="align-middle fs-6" /></h1>
            <div className="small text-body-secondary font-monospace">
              {b.sumber === 'gdocs' ? 'Google Docs' : b.fileName} · versi {b.versi} · dikirim {tanggal(b.createdAt)}
            </div>
          </div>
          <Link href="/mahasiswa/upload" className="btn btn-primary">Unggah versi {lainnya[0].versi + 1}</Link>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-6"><Preview b={b} untuk="mahasiswa" /></div>
        <div className="col-lg-6">
          <div className="card mb-4">
            <div className="card-header fw-semibold">Revisi dosen <span className="badge text-bg-secondary">{terkirim.length}</span></div>
            <div className="card-body">
              {!sudahDitanggapi ? (
                <p className="text-body-secondary mb-0">Berkas sedang menunggu review dosen. Revisi akan muncul di sini setelah dikirim.</p>
              ) : (
                <>
                  {b.ringkasan && (
                    <div className="alert alert-light border mb-3">
                      <div className="d-flex justify-content-between flex-wrap gap-2 mb-1">
                        <strong>Ringkasan dari dosen</strong>
                        <span className="small text-body-secondary">{waktu(b.keputusanAt)}</span>
                      </div>
                      <p className="mb-0 small pre-wrap">{b.ringkasan}</p>
                    </div>
                  )}
                  {terkirim.length > 0 && (
                    <>
                      <div className="d-flex justify-content-between small mb-1">
                        <span className="fw-semibold">{selesai} dari {terkirim.length} sudah diperbaiki</span>
                        <span className="text-body-secondary">{pct}%</span>
                      </div>
                      <div className="progress mb-3" role="progressbar" aria-label="Revisi selesai" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8 }}>
                        <div className="progress-bar bg-success" style={{ width: `${pct}%` }} />
                      </div>
                      <ol className="list-group list-group-numbered">
                        {terkirim.map((r) => (
                          <li key={r.id} className={`list-group-item d-flex gap-2${r.selesai ? ' list-group-item-success' : ''}`}>
                            <div className="flex-grow-1 ms-1">
                              <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
                                {r.lokasi && <span className="small fw-semibold">{r.lokasi}</span>}
                                <span className={`badge ${r.jenis === 'wajib' ? 'text-bg-dark' : 'text-bg-light border'}`}>{r.jenis === 'wajib' ? 'Wajib' : 'Saran'}</span>
                              </div>
                              <p className="mb-2 small pre-wrap">{r.teks}</p>
                              {b.status !== 'digantikan' && <RevisiCheck id={r.id} selesai={r.selesai} />}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  {b.status === 'disetujui' && !terkirim.length && <p className="mb-0">Berkas ini disetujui tanpa catatan revisi.</p>}
                  <div className="small text-body-secondary d-flex align-items-center gap-1 mt-3">
                    <IconRobot size={14} /> Revisi dapat disusun dengan bantuan agent dan selalu diperiksa dosen pembimbing.
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header fw-semibold">Riwayat versi</div>
            <div className="list-group list-group-flush">
              {lainnya.map((v) => (
                <Link key={v.id} href={`/mahasiswa/berkas/${v.id}`} className={`list-group-item list-group-item-action${v.id === b.id ? ' list-group-item-primary' : ''}`}>
                  <div className="d-flex justify-content-between flex-wrap gap-2">
                    <strong>Versi {v.versi}{v.id === b.id ? ' · sedang dibuka' : ''}</strong>
                    <StatusBadge s={v.status} />
                  </div>
                  <div className="small text-body-secondary">{tanggal(v.createdAt)}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
