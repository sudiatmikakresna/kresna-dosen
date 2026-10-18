'use client';

import { useState, useTransition } from 'react';
import { ocrHalamanPdf, tambahDokumenBot } from '@/app/dosen/actions';

// Teks diekstrak di browser lalu hanya teksnya yang dikirim ke server: file besar (puluhan MB) tidak perlu melewati
// batas body permintaan Vercel (±4,5 MB). Bot memang hanya memakai teks dokumen.
const BATAS_FILE = 100 * 1024 * 1024;
// OCR PDF hasil scan: halaman dirender jadi JPEG di browser lalu dibaca Claude per kelompok kecil
// (supaya setiap permintaan tetap di bawah batas body). Perkiraan biaya ±$0,01 per halaman (Sonnet 5.5).
const HALAMAN_PER_OCR = 4;
const MAKS_HALAMAN_OCR = 300;
const BATAS_KELOMPOK = 3_000_000; // karakter base64 per permintaan

class PdfScan extends Error {
  constructor(public halaman: number, public data: Uint8Array) {
    super('PDF hasil scan');
  }
}

async function halamanJpeg(pdf: Awaited<ReturnType<typeof import('unpdf').getDocumentProxy>>, nomor: number) {
  const page = await pdf.getPage(nomor);
  const dasar = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2.5, 1400 / dasar.width) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport } as Parameters<typeof page.render>[0]).promise;
  for (const kualitas of [0.75, 0.6, 0.45]) {
    const base64 = canvas.toDataURL('image/jpeg', kualitas).split(',')[1];
    if (base64.length < 1_300_000) return base64;
  }
  throw new Error(`Halaman ${nomor} terlalu besar untuk dibaca.`);
}

async function ocrPdf(data: Uint8Array, jumlah: number, lapor: (s: string) => void) {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(data);
  const hasil: string[] = [];
  let kelompok: { nomor: number; jpegBase64: string }[] = [];
  const kirim = async () => {
    if (!kelompok.length) return;
    lapor(`OCR halaman ${kelompok[0].nomor}–${kelompok[kelompok.length - 1].nomor} dari ${jumlah}…`);
    hasil.push((await ocrHalamanPdf(kelompok)).teks);
    kelompok = [];
  };
  for (let n = 1; n <= jumlah; n++) {
    lapor(`Menyiapkan halaman ${n} dari ${jumlah}…`);
    const halaman = { nomor: n, jpegBase64: await halamanJpeg(pdf, n) };
    // Satu permintaan tetap di bawah batas body server action (4 MB).
    const ukuran = kelompok.reduce((t, h) => t + h.jpegBase64.length, 0);
    if (kelompok.length >= HALAMAN_PER_OCR || ukuran + halaman.jpegBase64.length > BATAS_KELOMPOK) await kirim();
    kelompok.push(halaman);
  }
  await kirim();
  return hasil.join('\n\n');
}

async function ekstrak(file: File) {
  const nama = file.name.toLowerCase();
  if (nama.endsWith('.txt') || nama.endsWith('.md')) return file.text();
  if (nama.endsWith('.pdf')) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const data = new Uint8Array(await file.arrayBuffer());
    // pdf.js bisa mengambil alih buffer, jadi salinannya disimpan untuk OCR.
    const pdf = await getDocumentProxy(data.slice());
    const { text } = await extractText(pdf, { mergePages: false });
    const isi = text.join('').replace(/\s+/g, '');
    // PDF hasil scan hanya berisi gambar, jadi hampir tidak ada teks yang bisa dibaca.
    if (isi.length < Math.max(100, text.length * 20)) throw new PdfScan(text.length, data);
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
        try {
          teks = (await ekstrak(file)).trim();
        } catch (err) {
          if (!(err instanceof PdfScan)) throw err;
          if (err.halaman > MAKS_HALAMAN_OCR) throw new Error(`PDF hasil scan ${err.halaman} halaman; OCR maksimal ${MAKS_HALAMAN_OCR} halaman. Pecah file-nya dulu.`);
          const setuju = window.confirm(
            `PDF ini hasil scan (gambar), jadi teksnya tidak bisa dibaca langsung.\n\n` +
              `Baca dengan OCR Claude? ${err.halaman} halaman, perkiraan biaya ±$${(err.halaman * 0.01).toFixed(2)}, ` +
              `sekitar ${Math.ceil(err.halaman / HALAMAN_PER_OCR) * 15} detik. Jangan tutup halaman ini selama proses.`,
          );
          if (!setuju) throw new Error('PDF hasil scan tidak diunggah. Gunakan PDF hasil ekspor dari Word/Google Docs, atau setujui OCR.');
          teks = (await ocrPdf(err.data, err.halaman, setStatus)).trim();
        }
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
        Teks dibaca di browser Anda, jadi hanya teksnya yang dikirim. PDF hasil scan (gambar) dibaca dengan OCR Claude setelah Anda setujui.
      </p>
    </form>
  );
}
