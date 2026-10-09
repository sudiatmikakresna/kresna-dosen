'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, uploadSesi, users } from '@/db';
import { wajibMahasiswa } from '@/lib/auth';
import { ekstrakTeks } from '@/lib/extract';
import { eksporGdocs, gdocsId } from '@/lib/gdocs';
import { akunDrive, folderMahasiswa, unduhFile, unggahBuffer } from '@/lib/google';
import { JENIS, labelJenisPendek } from '@/lib/labels';
import { simpanBerkasBaru, tandaiSelesai } from '@/lib/service';

export type UploadState = { error?: string } | undefined;

const jenisIds = JENIS.map((j) => j.id) as [string, ...string[]];

const finalSchema = z.object({ uploadId: z.string().uuid(), catatan: z.string().max(2000).optional() });

/** Dipanggil setelah semua potongan terkirim ke Google Drive. */
export async function simpanUpload(data: z.infer<typeof finalSchema>): Promise<UploadState> {
  const user = await wajibMahasiswa();
  const parsed = finalSchema.safeParse(data);
  if (!parsed.success) return { error: 'Data unggahan tidak valid.' };
  const [sesi] = await db()
    .select()
    .from(uploadSesi)
    .where(and(eq(uploadSesi.id, parsed.data.uploadId), eq(uploadSesi.mahasiswaId, user.id)))
    .limit(1);
  if (!sesi?.driveFileId) return { error: 'Unggahan belum selesai. Coba unggah ulang.' };
  let teks: string | null = null;
  try {
    const res = await unduhFile(sesi.driveFileId);
    teks = await ekstrakTeks(Buffer.from(await res.arrayBuffer()), sesi.fileName);
  } catch (err) {
    console.error('Gagal membaca berkas untuk ekstraksi teks', err);
  }
  const b = await simpanBerkasBaru(user.id, {
    jenis: sesi.jenis,
    sumber: 'upload',
    driveFileId: sesi.driveFileId,
    fileName: sesi.fileName,
    ukuran: sesi.ukuran,
    catatan: parsed.data.catatan || null,
    teks,
  });
  await db().delete(uploadSesi).where(eq(uploadSesi.id, sesi.id));
  revalidatePath('/mahasiswa', 'layout');
  redirect(`/mahasiswa/berkas/${b.id}`);
}

export async function simpanGdocs(_: UploadState, form: FormData): Promise<UploadState> {
  const user = await wajibMahasiswa();
  const jenis = String(form.get('jenis') ?? '');
  const url = String(form.get('gdocsUrl') ?? '').trim();
  const catatan = String(form.get('catatan') ?? '').trim();
  if (!jenisIds.includes(jenis)) return { error: 'Pilih jenis berkas.' };
  const id = gdocsId(url);
  if (!id) return { error: 'Link Google Docs tidak dikenali. Salin link dari tombol Bagikan di Google Docs.' };
  if (!(await akunDrive())) return { error: 'Dosen belum menghubungkan Google Drive. Hubungi dosen pembimbing.' };
  const ekspor = await eksporGdocs(id);
  if (!ekspor) {
    return {
      error: 'Dokumen belum bisa dibaca sistem. Di Google Docs, buka Bagikan → Akses umum → "Siapa saja yang memiliki link" sebagai Pelihat, lalu kirim ulang.',
    };
  }
  const folder = await folderMahasiswa(user);
  const fileName = `${labelJenisPendek(jenis)} - salinan Google Docs ${new Date().toISOString().slice(0, 10)}.pdf`;
  const driveFileId = await unggahBuffer(fileName, folder, 'application/pdf', ekspor.pdf);
  const b = await simpanBerkasBaru(user.id, {
    jenis,
    sumber: 'gdocs',
    gdocsUrl: url,
    driveFileId,
    fileName,
    ukuran: ekspor.pdf.byteLength,
    catatan: catatan || null,
    teks: ekspor.teks,
  });
  revalidatePath('/mahasiswa', 'layout');
  redirect(`/mahasiswa/berkas/${b.id}`);
}
export async function ubahSelesai(revisiId: number, selesai: boolean) {
  const user = await wajibMahasiswa();
  await tandaiSelesai(revisiId, user.id, selesai);
  revalidatePath('/mahasiswa', 'layout');
}

export async function simpanJudul(form: FormData) {
  const user = await wajibMahasiswa();
  const judul = String(form.get('judul') ?? '').trim().slice(0, 500);
  await db().update(users).set({ judulSkripsi: judul || null }).where(eq(users.id, user.id));
  revalidatePath('/mahasiswa');
}
