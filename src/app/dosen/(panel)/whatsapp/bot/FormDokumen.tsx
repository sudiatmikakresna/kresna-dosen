'use client';

import { useState, useTransition } from 'react';
import { tambahDokumenBot } from '@/app/dosen/actions';

// Teks diekstrak di browser lalu hanya teksnya yang dikirim ke server: file besar (puluhan MB) tidak perlu melewati
// batas body permintaan Vercel (±4,5 MB). Bot memang hanya memakai teks dokumen.
const BATAS_FILE = 100 * 1024 * 1024;

async function ekstrak(file: File) {
  const nama = file.name.toLowerCase();
  if (nama.endsWith('.txt') || nama.endsWith('.md')) return file.text();
  if (nama.endsWith('.pdf')) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: false });
    const isi = text.join('').replace(/\s+/g, '');
    // PDF hasil scan hanya berisi gambar, jadi hampir tidak ada teks yang bisa dibaca.
    if (isi.length < Math.max(100, text.length * 20)) {
      throw new Error(`PDF ini tampaknya hasil scan (gambar): hanya ${isi.length} karakter terbaca dari ${text.length} halaman. Gunakan PDF hasil ekspor dari Word/Google Docs.`);
    }
    return text.map((t, i) => `--- Halaman ${i + 1} ---\n${t}`).join('\n\n');
  }
  if (nama.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  }
  throw new Error('Jenis file tidak didukung. Gunakan PDF, DOCX, TXT, atau MD.');
}

export function FormDokumen({ batasKarakter }: { batasKarakter: number }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sibuk = pending || status !== null;

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const file = form.get('file');
    const data = new FormData();
    data.set('judul', String(form.get('judul') ?? ''));
    let teks = String(form.get('teks') ?? '');
    try {
      if (file instanceof File && file.size > 0) {
        if (file.size > BATAS_FILE) throw new Error('File lebih dari 100 MB.');
        setStatus(`Membaca ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);
        teks = (await ekstrak(file)).trim();
        if (!teks) throw new Error('Teks tidak bisa dibaca dari file ini.');
        data.set('namaFile', file.name);
      }
      if (teks.length > batasKarakter) {
        throw new Error(`Teks dokumen ${teks.length.toLocaleString('id-ID')} karakter, melebihi batas ${batasKarakter.toLocaleString('id-ID')} karakter. Pecah dokumennya atau unggah bagian yang relevan saja.`);
      }
      data.set('teks', teks);
      setStatus(`Menyimpan ${teks.length.toLocaleString('id-ID')} karakter…`);
    } catch (err) {
      setStatus(null);
      setError((err as Error).message);
      return;
    }
    startTransition(async () => {
      await tambahDokumenBot(data);
      setStatus(null);
    });
  }

  return (
    <form onSubmit={kirim}>
      {error && <div className="alert alert-danger small py-2">{error}</div>}
      <label htmlFor="judul" className="form-label small">Judul (disebut sebagai sumber jawaban)</label>
      <input id="judul" name="judul" className="form-control form-control-sm mb-2" placeholder="mis. Panduan Skripsi 2026" required maxLength={200} />
      <label htmlFor="file" className="form-label small">File PDF, DOCX, TXT, atau MD (maks. 100 MB)</label>
      <input id="file" name="file" type="file" accept=".pdf,.docx,.txt,.md" className="form-control form-control-sm mb-2" />
      <label htmlFor="teks" className="form-label small">…atau tempel isinya</label>
      <textarea id="teks" name="teks" rows={5} className="form-control form-control-sm mb-2" placeholder="Bila file diunggah, kolom ini diabaikan." />
      <button type="submit" className="btn btn-primary btn-sm" disabled={sibuk}>
        {sibuk ? (status ?? 'Menyimpan…') : 'Tambah dokumen'}
      </button>
      <p className="small text-body-secondary mt-2 mb-0">
        Teks dibaca di browser Anda, jadi hanya teksnya yang dikirim. PDF hasil scan (gambar) tidak bisa dibaca.
      </p>
    </form>
  );
}
