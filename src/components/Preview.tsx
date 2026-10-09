import type { Berkas } from '@/db';
import { gdocsEditUrl, gdocsId, gdocsPreviewUrl } from '@/lib/gdocs';
import { BATAS_PRATINJAU, drivePreviewUrl, driveViewUrl } from '@/lib/google';
import { IconLink } from './icons';

/**
 * Pratinjau berkas.
 * Dosen: pratinjau Google Drive (file ada di Drive dosen).
 * Mahasiswa: lewat server aplikasi (/api/berkas/:id/file), karena Drive dosen tidak dibagikan.
 */
export function Preview({ b, untuk }: { b: Berkas; untuk: 'dosen' | 'mahasiswa' }) {
  const docId = b.gdocsUrl ? gdocsId(b.gdocsUrl) : null;
  const pdf = (b.fileName ?? '').toLowerCase().endsWith('.pdf');
  const kecil = (b.ukuran ?? 0) <= BATAS_PRATINJAU;
  let src: string | null = null;
  let pesan = 'Pratinjau tidak tersedia.';
  if (docId) {
    src = gdocsPreviewUrl(docId);
  } else if (b.driveFileId && untuk === 'dosen') {
    src = drivePreviewUrl(b.driveFileId);
  } else if (b.driveFileId && pdf && kecil) {
    src = `/api/berkas/${b.id}/file`;
  } else if (b.driveFileId && !pdf) {
    pesan = 'Pratinjau file ini hanya tersedia untuk dosen. Berkas tersimpan di Google Drive dosen.';
  } else if (b.driveFileId) {
    pesan = 'Berkas di atas 4 MB tidak bisa dipratinjau di sini. Berkas tetap tersimpan di Google Drive dosen.';
  }
  return (
    <div className="card">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2 small">
        <span className="fw-semibold">{docId ? 'Google Docs (dokumen langsung)' : 'Pratinjau'}</span>
        <div className="d-flex flex-wrap gap-2">
          {docId && (
            <a className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" href={gdocsEditUrl(docId)} target="_blank" rel="noreferrer">
              <IconLink /> Buka di Google Docs
            </a>
          )}
          {b.driveFileId && untuk === 'dosen' && (
            <a className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" href={driveViewUrl(b.driveFileId)} target="_blank" rel="noreferrer">
              <IconLink /> {docId ? 'Salinan PDF di Drive' : 'Buka di Google Drive'}
            </a>
          )}
          {b.driveFileId && untuk === 'mahasiswa' && pdf && kecil && docId && (
            <a className="btn btn-sm btn-outline-secondary" href={`/api/berkas/${b.id}/file`} target="_blank" rel="noreferrer">Salinan PDF versi ini</a>
          )}
        </div>
      </div>
      {docId && (
        <div className="alert alert-info rounded-0 border-0 border-bottom small mb-0 py-2">
          Dokumen Google Docs bisa berubah. Revisi mengacu ke salinan PDF yang diambil saat berkas dikirim.
        </div>
      )}
      {src ? (
        <iframe className="pdf-frame" src={src} title={`Pratinjau ${b.fileName ?? 'berkas'}`} />
      ) : (
        <div className="card-body text-body-secondary">{pesan}</div>
      )}
    </div>
  );
}
