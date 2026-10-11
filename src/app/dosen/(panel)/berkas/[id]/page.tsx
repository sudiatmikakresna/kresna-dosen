import Link from 'next/link';
import { notFound } from 'next/navigation';
import { labelJenis, labelJenisPendek, tanggal, terpisah, waktu } from '@/lib/labels';
import { detailBerkas, versiSebelumnya } from '@/lib/service';
import { AMBANG_PERSEN, JUMLAH_BIMBINGAN, rekapPerbaikan, type RekapPerbaikan } from '@/lib/perbaikan';
import { Preview } from '@/components/Preview';
import { StatusBadge } from '@/components/StatusBadge';
import { SubmitButton } from '@/components/SubmitButton';
import { IconRobot } from '@/components/icons';
import { kirimKeMahasiswa, simpanCatatan, simpanRingkasan, tambahCatatan, ubahStatusCatatan } from '@/app/dosen/actions';

export const metadata = { title: 'Tinjau Berkas' };

function FieldsCatatan({ lokasi = '', jenis = 'wajib', teks = '', idPrefix }: { lokasi?: string; jenis?: string; teks?: string; idPrefix: string }) {
  return (
    <>
      <div className="row g-2 mb-2">
        <div className="col-sm-8">
          <label htmlFor={`${idPrefix}-lokasi`} className="form-label small mb-1">Lokasi</label>
          <input id={`${idPrefix}-lokasi`} name="lokasi" className="form-control form-control-sm" defaultValue={lokasi} placeholder="cth. Hal. 12 · 2.1 Landasan Teori" />
        </div>
        <div className="col-sm-4">
          <label htmlFor={`${idPrefix}-jenis`} className="form-label small mb-1">Jenis</label>
          <select id={`${idPrefix}-jenis`} name="jenis" className="form-select form-select-sm" defaultValue={jenis}>
            <option value="wajib">Wajib</option>
            <option value="saran">Saran</option>
          </select>
        </div>
      </div>
      <label htmlFor={`${idPrefix}-teks`} className="form-label small mb-1">Catatan</label>
      <textarea id={`${idPrefix}-teks`} name="teks" className="form-control form-control-sm mb-2" rows={3} defaultValue={teks} required />
    </>
  );
}

function KartuPerbaikan({ r }: { r: RekapPerbaikan }) {
  const label =
    r.belumDinilai > 0
      ? { teks: `${r.belumDinilai} catatan belum dinilai`, cls: 'text-bg-secondary' }
      : r.bolehDisetujui
        ? { teks: 'Memenuhi syarat disetujui', cls: 'text-bg-success' }
        : { teks: 'Belum memenuhi syarat', cls: 'text-bg-warning' };
  return (
    <div className="card mt-4">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span className="fw-semibold">Perbaikan per sub bab · pengecekan ke-{r.pengecekanKe}</span>
        <span className={`badge ${label.cls}`}>{label.teks}</span>
      </div>
      <div className="card-body small pb-2">
        <p className="text-body-secondary mb-2">
          Catatan dari {JUMLAH_BIMBINGAN} bimbingan terakhir (versi {r.versiDinilai.join(' & ')}). Disetujui bila setiap sub bab &gt; {AMBANG_PERSEN}% diperbaiki.
        </p>
        <table className="table table-sm align-middle mb-2">
          <thead>
            <tr><th scope="col">Sub bab</th><th scope="col">Diperbaiki</th><th scope="col" style={{ width: '40%' }}>Persentase</th></tr>
          </thead>
          <tbody>
            {r.perSubBab.map((x) => (
              <tr key={x.subBab}>
                <td className="fw-semibold">{x.subBab}</td>
                <td>{x.diperbaiki}/{x.total}{x.dinilai < x.total && <span className="text-body-secondary"> ({x.total - x.dinilai} belum dinilai)</span>}</td>
                <td>
                  <div className="d-flex align-items-center gap-2">
                    <div className="progress flex-grow-1" role="progressbar" aria-label={`Sub bab ${x.subBab}`} aria-valuenow={x.persen} aria-valuemin={0} aria-valuemax={100} style={{ height: 6 }}>
                      <div className={`progress-bar ${x.lolos ? 'bg-success' : 'bg-warning'}`} style={{ width: `${x.persen}%` }} />
                    </div>
                    <span className={x.lolos ? '' : 'text-warning-emphasis fw-semibold'}>{x.persen}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <details>
          <summary>Rincian per catatan</summary>
          <ul className="list-unstyled mt-2 mb-0 d-grid gap-2">
            {r.catatan.map((c) => (
              <li key={c.revisiId} className="d-flex gap-2">
                <span className={`badge align-self-start ${c.diperbaiki === null ? 'text-bg-secondary' : c.diperbaiki ? 'text-bg-success' : 'text-bg-warning'}`}>
                  {c.diperbaiki === null ? 'Belum dinilai' : c.diperbaiki ? 'Diperbaiki' : 'Belum'}
                </span>
                <span>
                  <span className="text-body-secondary">v{c.versi} · </span>
                  {c.lokasi && <strong>{c.lokasi}: </strong>}
                  {c.teks}
                  {c.keterangan && <span className="d-block text-body-secondary fst-italic">{c.keterangan}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}

export default async function TinjauBerkas({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const d = await detailBerkas(id);
  if (!d) notFound();
  const { berkas: b, mahasiswa: m } = d;
  const [lama, rekap] = await Promise.all([versiSebelumnya(b), rekapPerbaikan(b.id)]);
  const draf = d.revisi.filter((r) => r.status === 'draf');
  const dibuang = d.revisi.filter((r) => r.status === 'dibuang');
  const terkirim = d.revisi.filter((r) => r.status === 'dikirim');
  const dariMcp = draf.filter((r) => r.sumber === 'mcp').length;

  return (
    <>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item"><Link href="/dosen">Mahasiswa</Link></li>
          <li className="breadcrumb-item"><Link href={`/dosen/mahasiswa/${m.id}`}>{m.nama}</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{terpisah(b.jenis) ? b.fileName : `${labelJenis(b.jenis)} v${b.versi}`}</li>
        </ol>
      </nav>

      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 className="h3 mb-1">{terpisah(b.jenis) ? `${labelJenisPendek(b.jenis)} · ${b.fileName}` : `${labelJenis(b.jenis)} · versi ${b.versi}`} <StatusBadge s={b.status} className="align-middle fs-6" /></h1>
          <div className="small text-body-secondary">
            {m.nama} · <span className="font-monospace">{m.nim}</span> · dikirim {waktu(b.createdAt)} · ID berkas <span className="font-monospace">{b.id}</span>
          </div>
        </div>
      </div>

      {b.catatan && (
        <div className="alert alert-light border small"><strong>Catatan mahasiswa:</strong> <span className="pre-wrap">{b.catatan}</span></div>
      )}
      {dariMcp > 0 && (
        <div className="alert alert-info d-flex align-items-center gap-2 py-2 small" role="status">
          <IconRobot size={18} /> {dariMcp} catatan draf ditambahkan lewat MCP. Belum terlihat oleh mahasiswa sampai Anda kirim.
        </div>
      )}

      <div className="row g-4">
        <div className="col-xl-6">
          <Preview b={b} untuk="dosen" />
          {rekap && rekap.pengecekanKe >= 2 && <KartuPerbaikan r={rekap} />}
          {lama.length > 0 && (
            <div className="card mt-4">
              <div className="card-header fw-semibold">Revisi pada versi sebelumnya</div>
              <div className="list-group list-group-flush">
                {lama.map((l) => (
                  <div key={l.id} className="list-group-item">
                    <div className="d-flex justify-content-between flex-wrap gap-2 mb-1">
                      <Link href={`/dosen/berkas/${l.id}`} className="fw-semibold">Versi {l.versi} · {tanggal(l.createdAt)}</Link>
                      <span className="small text-body-secondary">{l.revisi.filter((r) => r.selesai).length}/{l.revisi.length} ditandai selesai oleh mahasiswa</span>
                    </div>
                    <ol className="small mb-0 ps-3">
                      {l.revisi.map((r) => <li key={r.id} className={r.selesai ? 'text-body-secondary' : ''}>{r.lokasi && <strong>{r.lokasi}: </strong>}{r.teks}</li>)}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="col-xl-6">
          <div className="card mb-4">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="fw-semibold">Catatan revisi (draf)</span>
              <span className="small text-body-secondary">{draf.length} akan dikirim · {dibuang.length} dibuang</span>
            </div>
            <div className="card-body">
              <ol className={`list-group list-group-numbered${draf.length ? ' mb-3' : ''}`}>
                {draf.map((r) => (
                  <li key={r.id} className="list-group-item d-flex gap-2">
                    <div className="flex-grow-1 ms-1">
                      <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
                        {r.lokasi && <span className="small fw-semibold">{r.lokasi}</span>}
                        <span className={`badge ${r.jenis === 'wajib' ? 'text-bg-dark' : 'text-bg-light border'}`}>{r.jenis === 'wajib' ? 'Wajib' : 'Saran'}</span>
                        {r.sumber === 'mcp' && <span className="badge text-bg-info">via MCP</span>}
                      </div>
                      <p className="small mb-2 pre-wrap">{r.teks}</p>
                      <details>
                        <summary className="small text-primary" style={{ cursor: 'pointer' }}>Ubah teks</summary>
                        <form action={simpanCatatan.bind(null, b.id, r.id)} className="mt-2">
                          <FieldsCatatan idPrefix={`r${r.id}`} lokasi={r.lokasi} jenis={r.jenis} teks={r.teks} />
                          <SubmitButton className="btn btn-sm btn-primary">Simpan</SubmitButton>
                        </form>
                      </details>
                      <form action={ubahStatusCatatan.bind(null, b.id, r.id, 'dibuang')} className="mt-2">
                        <button className="btn btn-sm btn-outline-secondary">Buang</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ol>
              {!draf.length && <p className="text-body-secondary small">Belum ada catatan draf. Tambahkan di bawah atau lewat MCP.</p>}

              {dibuang.length > 0 && (
                <details className="mb-3">
                  <summary className="small">Catatan yang dibuang ({dibuang.length})</summary>
                  <ul className="list-group mt-2">
                    {dibuang.map((r) => (
                      <li key={r.id} className="list-group-item bg-body-tertiary small d-flex justify-content-between gap-2">
                        <span className="text-body-secondary text-decoration-line-through">{r.teks}</span>
                        <form action={ubahStatusCatatan.bind(null, b.id, r.id, 'draf')}><button className="btn btn-sm btn-outline-success text-nowrap">Pakai lagi</button></form>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <details>
                <summary className="btn btn-sm btn-outline-primary">Tambah catatan sendiri</summary>
                <form action={tambahCatatan.bind(null, b.id)} className="border p-3 mt-2">
                  <FieldsCatatan idPrefix="baru" />
                  <SubmitButton className="btn btn-sm btn-primary">Tambah ke draf</SubmitButton>
                </form>
              </details>
            </div>
          </div>

          <form action={kirimKeMahasiswa.bind(null, b.id)} className="card mb-4">
            <div className="card-header fw-semibold">Kirim ke mahasiswa</div>
            <div className="card-body">
              <label htmlFor="ringkasan" className="form-label small fw-semibold">Ringkasan untuk mahasiswa</label>
              <textarea id="ringkasan" name="ringkasan" className="form-control mb-3" rows={3} defaultValue={b.ringkasan ?? ''} />
              <div className="btn-group" role="group" aria-label="Keputusan untuk berkas ini">
                <input type="radio" className="btn-check" name="keputusan" id="k-revisi" value="perlu_revisi" defaultChecked={b.status !== 'disetujui'} />
                <label className="btn btn-outline-warning" htmlFor="k-revisi">Perlu revisi</label>
                <input type="radio" className="btn-check" name="keputusan" id="k-ok" value="disetujui" defaultChecked={b.status === 'disetujui'} />
                <label className="btn btn-outline-success" htmlFor="k-ok">Setujui bab ini</label>
              </div>
            </div>
            <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2 py-3">
              <button formAction={simpanRingkasan.bind(null, b.id)} className="btn btn-outline-secondary">Simpan ringkasan saja</button>
              <SubmitButton pendingText="Mengirim…">Kirim {draf.length} catatan ke mahasiswa</SubmitButton>
            </div>
          </form>

          {terkirim.length > 0 && (
            <div className="card">
              <div className="card-header fw-semibold">Sudah dikirim ({terkirim.length})</div>
              <ol className="list-group list-group-flush list-group-numbered">
                {terkirim.map((r) => (
                  <li key={r.id} className={`list-group-item small${r.selesai ? ' list-group-item-success' : ''}`}>
                    {r.lokasi && <strong>{r.lokasi}: </strong>}{r.teks}
                    {r.selesai && <span className="badge text-bg-success ms-2">Diperbaiki</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
