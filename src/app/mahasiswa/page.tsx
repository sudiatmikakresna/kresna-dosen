import Link from 'next/link';
import { wajibMahasiswa } from '@/lib/auth';
import { labelJenis, labelJenisPendek, status, tanggal, waktu, relatif } from '@/lib/labels';
import { aktivitasMahasiswa, berkasMahasiswa, revisiTerbukaMahasiswa, tahapDari } from '@/lib/service';
import { StatusBadge } from '@/components/StatusBadge';
import { IconFile, IconUpload } from '@/components/icons';
import { simpanJudul } from './actions';

export const metadata = { title: 'Dashboard' };

export default async function DashboardMahasiswa() {
  const user = await wajibMahasiswa();
  const [daftar, log, terbuka] = await Promise.all([
    berkasMahasiswa(user.id),
    aktivitasMahasiswa(user.id, 8),
    revisiTerbukaMahasiswa(user.id),
  ]);
  const tahap = tahapDari(daftar);
  const selesai = tahap.filter((t) => t.status === 'disetujui').length;
  const keputusanTerakhir = daftar.filter((b) => b.keputusanAt).sort((a, b) => b.keputusanAt!.getTime() - a.keputusanAt!.getTime())[0];

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="h3 mb-0">Dashboard</h1>
          <div className="text-body-secondary small">Halo, {user.nama}</div>
        </div>
        <Link href="/mahasiswa/upload" className="btn btn-primary d-inline-flex align-items-center gap-2">
          <IconUpload /> Upload berkas baru
        </Link>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card h-100"><div className="card-body">
            <div className="text-body-secondary small">Revisi belum selesai</div>
            <div className="fs-3 fw-semibold text-warning-emphasis">{terbuka}</div>
            <Link href="/mahasiswa/berkas" className="small">Lihat berkas &amp; revisi</Link>
          </div></div>
        </div>
        <div className="col-md-4">
          <div className="card h-100"><div className="card-body">
            <div className="text-body-secondary small">Berkas diunggah</div>
            <div className="fs-3 fw-semibold">{daftar.length}</div>
            <div className="small text-body-secondary">{daftar.length ? `sejak ${tanggal(daftar[daftar.length - 1].createdAt)}` : 'belum ada'}</div>
          </div></div>
        </div>
        <div className="col-md-4">
          <div className="card h-100"><div className="card-body">
            <div className="text-body-secondary small">Tanggapan terakhir dari dosen</div>
            <div className="fs-3 fw-semibold">{keputusanTerakhir ? relatif(keputusanTerakhir.keputusanAt) : '—'}</div>
            <div className="small text-body-secondary">{keputusanTerakhir ? `${labelJenisPendek(keputusanTerakhir.jenis)} · ${tanggal(keputusanTerakhir.keputusanAt)}` : 'belum ada'}</div>
          </div></div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header d-flex flex-wrap justify-content-between gap-2">
          <span className="fw-semibold">Kemajuan skripsi</span>
          <span className="text-body-secondary small">{selesai} dari {tahap.length} tahap disetujui</span>
        </div>
        <div className="card-body">
          <form action={simpanJudul} className="mb-3">
            <label htmlFor="judul" className="form-label small text-body-secondary mb-1">Judul skripsi</label>
            <div className="input-group">
              <input id="judul" name="judul" className="form-control" defaultValue={user.judulSkripsi ?? ''} placeholder="Tulis judul skripsi Anda" />
              <button className="btn btn-outline-primary">Simpan</button>
            </div>
          </form>
          <div className="row row-cols-2 row-cols-md-4 g-2">
            {tahap.map((t) => (
              <div className="col" key={t.jenis}>
                <div className="border p-2 h-100">
                  <div className="progress mb-2" role="progressbar" aria-label={labelJenisPendek(t.jenis)} style={{ height: 6 }}>
                    <div className={`progress-bar ${status(t.status).bar}`} style={{ width: '100%' }} />
                  </div>
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
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Berkas terbaru</span>
              <Link href="/mahasiswa/berkas" className="small">Lihat semua</Link>
            </div>
            <div className="list-group list-group-flush">
              {daftar.slice(0, 5).map((b) => (
                <Link key={b.id} href={`/mahasiswa/berkas/${b.id}`} className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3">
                  <IconFile size={24} className="text-primary flex-shrink-0" />
                  <div className="flex-grow-1 text-truncate">
                    <div className="fw-semibold">{labelJenis(b.jenis)}</div>
                    <div className="small text-body-secondary font-monospace">versi {b.versi} · {tanggal(b.createdAt)}</div>
                  </div>
                  <StatusBadge s={b.status} />
                </Link>
              ))}
              {!daftar.length && <div className="list-group-item text-body-secondary">Belum ada berkas. Mulai dengan mengunggah Bab 1.</div>}
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card h-100">
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
