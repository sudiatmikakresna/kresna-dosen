'use client';

import { upload } from '@vercel/blob/client';
import { useActionState, useState } from 'react';
import { JENIS } from '@/lib/labels';
import { SubmitButton } from '@/components/SubmitButton';
import { simpanGdocs, simpanUpload } from './actions';

export function UploadForm({ versiBerikut }: { versiBerikut: Record<string, number> }) {
  const [mode, setMode] = useState<'file' | 'gdocs'>('file');
  const [jenis, setJenis] = useState<string>('bab1');
  const [catatan, setCatatan] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gState, gAction] = useActionState(simpanGdocs, undefined);

  async function kirimFile(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError('Pilih berkas terlebih dahulu.');
    if (file.size > 20 * 1024 * 1024) return setError('Ukuran berkas maksimal 20 MB.');
    setError(null);
    setProgress(0);
    try {
      const blob = await upload(`berkas/${jenis}/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });
      const res = await simpanUpload({ jenis, catatan, fileUrl: blob.url, fileName: file.name });
      if (res?.error) setError(res.error);
    } catch (err) {
      if ((err as Error & { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
      setError((err as Error).message || 'Gagal mengunggah berkas.');
    } finally {
      setProgress(null);
    }
  }

  const jenisField = (
    <div className="mb-3">
      <label htmlFor="jenis" className="form-label">Jenis berkas</label>
      <select id="jenis" name="jenis" className="form-select" value={jenis} onChange={(e) => setJenis(e.target.value)}>
        {JENIS.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
      </select>
      <div className="form-text">Akan disimpan sebagai <strong>versi {versiBerikut[jenis] ?? 1}</strong>.</div>
    </div>
  );
  const catatanField = (
    <div className="mb-3">
      <label htmlFor="catatan" className="form-label">Catatan untuk dosen <span className="text-body-secondary">(opsional)</span></label>
      <textarea id="catatan" name="catatan" className="form-control" rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)}
        placeholder="cth. Revisi nomor 2 dan 3 sudah saya perbaiki di halaman 14–16." />
    </div>
  );

  return (
    <div className="card">
      <div className="card-header">
        <ul className="nav nav-tabs card-header-tabs" role="tablist">
          <li className="nav-item" role="presentation">
            <button type="button" role="tab" aria-selected={mode === 'file'} className={`nav-link${mode === 'file' ? ' active' : ''}`} onClick={() => setMode('file')}>Unggah file</button>
          </li>
          <li className="nav-item" role="presentation">
            <button type="button" role="tab" aria-selected={mode === 'gdocs'} className={`nav-link${mode === 'gdocs' ? ' active' : ''}`} onClick={() => setMode('gdocs')}>Link Google Docs</button>
          </li>
        </ul>
      </div>
      <div className="card-body">
        {mode === 'file' ? (
          <form onSubmit={kirimFile}>
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            {jenisField}
            <div className="mb-3">
              <label htmlFor="file" className="form-label">Berkas</label>
              <input id="file" className="form-control" type="file" accept=".pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <div className="form-text">PDF atau DOCX, maksimal 20 MB.</div>
            </div>
            {progress !== null && (
              <div className="progress mb-3" role="progressbar" aria-label="Progres unggah" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-bar" style={{ width: `${progress}%` }}>{progress}%</div>
              </div>
            )}
            {catatanField}
            <div className="d-flex justify-content-end">
              <button type="submit" className="btn btn-primary" disabled={progress !== null}>{progress !== null ? 'Mengunggah…' : 'Kirim ke dosen'}</button>
            </div>
          </form>
        ) : (
          <form action={gAction}>
            {gState?.error && <div className="alert alert-danger py-2 small">{gState.error}</div>}
            {jenisField}
            <div className="mb-3">
              <label htmlFor="gdocsUrl" className="form-label">Link Google Docs</label>
              <input id="gdocsUrl" name="gdocsUrl" type="url" className="form-control" placeholder="https://docs.google.com/document/d/…/edit" required />
              <div className="form-text">
                Atur berbagi ke <strong>“Siapa saja yang memiliki link – Pelihat”</strong>. Saat dikirim, sistem menyimpan salinan PDF sebagai versi ini.
              </div>
            </div>
            {catatanField}
            <div className="d-flex justify-content-end">
              <SubmitButton pendingText="Mengambil dokumen…">Kirim ke dosen</SubmitButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
