import Link from 'next/link';
import { labelJenisPendek, relatif, tanggal, TAHAP } from '@/lib/labels';
import { daftarMahasiswa } from '@/lib/service';
import { StatusBadge } from '@/components/StatusBadge';

export const metadata = { title: 'Mahasiswa Bimbingan' };

type Mhs = Awaited<ReturnType<typeof daftarMahasiswa>>[number];
const FILTER: { id: string; label: string; test: (m: Mhs) => boolean }[] = [
  { id: 'semua', label: 'Semua', test: () => true },
  { id: 'review', label: 'Perlu ditinjau', test: (m) => ['menunggu', 'draf'].includes(m.berkasTerakhir?.status ?? '') },
  { id: 'revisi', label: 'Menunggu perbaikan', test: (m) => m.berkasTerakhir?.status === 'perlu_revisi' },
  { id: 'idle', label: 'Tidak aktif', test: (m) => m.tidakAktif },
];

export default async function DaftarMahasiswaPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; ok?: string; error?: string }> }) {
  const { filter = 'semua', q = '', ok, error } = await searchParams;
  const semua = await daftarMahasiswa();
  const aktif = FILTER.find((f) => f.id === filter) ?? FILTER[0];
  const cari = q.trim().toLowerCase();
  const rows = semua.filter(aktif.test).filter((m) => !cari || m.nama.toLowerCase().includes(cari) || m.nim.includes(cari));
  const perluTinjau = semua.filter(FILTER[1].test).length;

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="h3 mb-0">Mahasiswa Bimbingan</h1>
          <div className="text-body-secondary small">Telusuri kemajuan dan riwayat bimbingan setiap mahasiswa.</div>
        </div>
        <form role="search" style={{ width: 320, maxWidth: '100%' }}>
          <input type="hidden" name="filter" value={aktif.id} />
          <label htmlFor="q" className="visually-hidden">Cari nama atau NIM</label>
          <div className="input-group">
            <input id="q" name="q" type="search" className="form-control" placeholder="Cari nama atau NIM" defaultValue={q} />
            <button className="btn btn-outline-primary">Cari</button>
          </div>
        </form>
      </div>
      {ok && <div className="alert alert-success">{ok}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3"><div className="card h-100"><div className="card-body">
          <div className="small text-body-secondary">Mahasiswa terdaftar</div><div className="fs-3 fw-semibold">{semua.length}</div>
        </div></div></div>
        <div className="col-6 col-md-3"><div className="card h-100"><div className="card-body">
          <div className="small text-body-secondary">Perlu ditinjau</div><div className="fs-3 fw-semibold">{perluTinjau}</div>
        </div></div></div>
        <div className="col-6 col-md-3"><div className="card h-100"><div className="card-body">
          <div className="small text-body-secondary">Menunggu perbaikan</div><div className="fs-3 fw-semibold">{semua.filter(FILTER[2].test).length}</div>
        </div></div></div>
        <div className="col-6 col-md-3"><div className="card h-100"><div className="card-body">
          <div className="small text-body-secondary">Tidak aktif &gt; 14 hari</div><div className="fs-3 fw-semibold text-danger-emphasis">{semua.filter(FILTER[3].test).length}</div>
        </div></div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="btn-group btn-group-sm flex-wrap" role="group" aria-label="Filter mahasiswa">
            {FILTER.map((f) => (
              <Link key={f.id} href={`/dosen?filter=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className={`btn ${f.id === aktif.id ? 'btn-primary' : 'btn-outline-primary'}`} aria-current={f.id === aktif.id ? 'true' : undefined}>
                {f.label} <span className="badge text-bg-light ms-1">{semua.filter(f.test).length}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th scope="col">Mahasiswa</th>
                <th scope="col" style={{ width: 180 }}>Kemajuan</th>
                <th scope="col">Berkas terakhir</th>
                <th scope="col">Status</th>
                <th scope="col">Aktif terakhir</th>
                <th scope="col"><span className="visually-hidden">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const pct = Math.round((m.tahapSelesai / TAHAP.length) * 100);
                const b = m.berkasTerakhir;
                const perluTinjau = b && ['menunggu', 'draf'].includes(b.status);
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/dosen/mahasiswa/${m.id}`} className="fw-semibold text-decoration-none">{m.nama}</Link>
                      <div className="small text-body-secondary font-monospace">{m.nim}</div>
                    </td>
                    <td>
                      <div className="progress" role="progressbar" aria-label={`Kemajuan ${m.nama}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8 }}>
                        <div className="progress-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="small text-body-secondary mt-1">{m.tahapSelesai}/{TAHAP.length} tahap disetujui</div>
                    </td>
                    <td>{b ? <><div>{labelJenisPendek(b.jenis)} v{b.versi}</div><div className="small text-body-secondary">{tanggal(b.createdAt)}</div></> : <span className="text-body-secondary">—</span>}</td>
                    <td>{b ? <StatusBadge s={b.status} /> : <StatusBadge s="belum" />}</td>
                    <td className={`small${m.tidakAktif ? ' text-danger fw-semibold' : ''}`}>{relatif(m.aktifTerakhir)}</td>
                    <td className="text-end">
                      {b && perluTinjau
                        ? <Link href={`/dosen/berkas/${b.id}`} className="btn btn-sm btn-primary text-nowrap">Tinjau</Link>
                        : <Link href={`/dosen/mahasiswa/${m.id}`} className="btn btn-sm btn-outline-secondary text-nowrap">Riwayat</Link>}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={6} className="text-body-secondary">Tidak ada mahasiswa yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-footer small text-body-secondary">Menampilkan {rows.length} dari {semua.length} mahasiswa</div>
      </div>
    </>
  );
}
