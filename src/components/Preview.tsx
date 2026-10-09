import type { Berkas } from '@/db';
import { gdocsEditUrl, gdocsId, gdocsPreviewUrl } from '@/lib/gdocs';
import { IconLink, IconUnduh } from './icons';

/** Pratinjau berkas: PDF langsung, DOCX lewat Office viewer, Google Docs lewat /preview. */
export function Preview({ b }: { b: Berkas }) {
  const docId = b.gdocsUrl ? gdocsId(b.gdocsUrl) : null;
  let src: string | null = null;
  let label = 'Pratinjau';
  if (docId) {
    src = gdocsPreviewUrl(docId);
    label = 'Google Docs (dokumen langsung)';
  } else if (b.fileUrl && b.fileName?.toLowerCase().endsWith('.pdf')) {
    src = b.fileUrl;
  } else if (b.fileUrl) {
    src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(b.fileUrl)}`;
  }
  return (
    <div className="card">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2 small">
        <span className="fw-semibold">{label}</span>
        <div className="d-flex gap-2">
          {docId && (
            <a className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" href={gdocsEditUrl(docId)} target="_blank" rel="noreferrer">
              <IconLink /> Buka di Google Docs
            </a>
          )}
          {b.fileUrl && (
            <a className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" href={b.fileUrl} target="_blank" rel="noreferrer">
              <IconUnduh /> {docId ? 'Salinan PDF versi ini' : 'Unduh'}
            </a>
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
        <div className="card-body text-body-secondary">Pratinjau tidak tersedia.</div>
      )}
    </div>
  );
}
