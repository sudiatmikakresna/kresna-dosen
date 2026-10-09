'use client';

import { useActionState, useState } from 'react';
import { ekstensiDiizinkan, JENIS, terpisah } from '@/lib/labels';
import { SubmitButton } from '@/components/SubmitButton';
import { simpanGdocs, simpanUpload } from './actions';

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Gagal (${res.status})`);
  return data as T;
}

/** Unggah bertahap: browser → server → Google Drive dosen, potongan 2 MB. */
async function unggahKeDrive(file: File, jenis: string, onProgress: (p: number) => void) {
  const { id, chunk } = await json<{ id: string; chunk: number }>(
    await fetch('/api/drive/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jenis, fileName: file.name, ukuran: file.size }),
    }),
  );
  for (let offset = 0; offset < file.size; offset += chunk) {
    const potong = file.slice(offset, Math.min(offset + chunk, file.size));
    let hasil: { selesai: boolean } | null = null;
    for (let coba = 0; coba < 3 && !hasil; coba++) {
      try {
        hasil = await json(await fetch(`/api/drive/upload/${id}?offset=${offset}`, { method: 'PUT', body: potong }));
      } catch (e) {
        if (coba === 2) throw e;
      }
    }
    onProgress(Math.round(((offset + potong.size) / file.size) * 100));
  }
  return id;
}

export function UploadForm({ versiBerikut, driveSiap }: { versiBerikut: Record<string, number>; driveSiap: boolean }) {
  const [mode, setMode] = useState<'file' | 'gdocs'>('file');
  const [jenis, setJenis] = useState<string>('bab1');
  const [catatan, setCatatan] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gState, gAction] = useActionState(simpanGdocs, undefined);

  const izin = ekstensiDiizinkan(jenis);
  const lainnya = terpisah(jenis);

  async function kirimFile(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError('Pilih berkas terlebih dahulu.');
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    if (!izin.includes(ext)) return setError(`Jenis file tidak diterima. Gunakan: ${izin.join(', ').toUpperCase()}.`);
    if (file.size > 20 * 1024 * 1024) return setError('Ukuran berkas maksimal 20 MB.');
    setError(null);
    setProgress(0);
    try {
      const uploadId = await unggahKeDrive(file, jenis, setProgress);
      const res = await simpanUpload({ uploadId, catatan });
      if (res?.error) setError(res.error);
    } catch (err) {
      if ((err as Error & { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
      setError((err as Error).message || 'Gagal mengunggah berkas.');
    } finally {
      setProgress(null);
    }
  }

  if (!driveSiap) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="alert alert-warning mb-0">Dosen belum menghubungkan Google Drive, jadi berkas belum bisa diunggah. Hubungi dosen pembimbing.</div>
        </div>
      </div>
    );
  }

  const jenisField = (
    <div className="mb-3">
      <label htmlFor="jenis" className="form-label">Jenis berkas</label>
      <select id="jenis" name="jenis" className="form-select" value={jenis} onChange={(e) => setJenis(e.target.value)}>
        {JENIS.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
      </select>
      <div className="form-text">
        {lainnya
          ? 'Untuk lampiran, data hasil penelitian, kuesioner, dan dokumen pendukung lain. Setiap unggahan disimpan sebagai dokumen terpisah.'
          : <>Akan disimpan sebagai <strong>versi {versiBerikut[jenis] ?? 1}</strong>.</>}
      </div>
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
              <input id="file" className="form-control" type="file" accept={izin.map((x) => `.${x}`).join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <div className="form-text">{izin.join(', ').toUpperCase()}, maksimal 20 MB. Disimpan di Google Drive dosen pembimbing.</div>
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
                Atur berbagi ke <strong>“Siapa saja yang memiliki link – Pelihat”</strong>. Saat dikirim, sistem menyimpan salinan PDF di Google Drive dosen sebagai versi ini.
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
