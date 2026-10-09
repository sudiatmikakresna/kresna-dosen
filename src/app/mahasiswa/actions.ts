'use server';

import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, users } from '@/db';
import { wajibMahasiswa } from '@/lib/auth';
import { ekstrakTeks } from '@/lib/extract';
import { eksporGdocs, gdocsId } from '@/lib/gdocs';
import { JENIS } from '@/lib/labels';
import { simpanBerkasBaru, tandaiSelesai } from '@/lib/service';

export type UploadState = { error?: string } | undefined;

const jenisIds = JENIS.map((j) => j.id) as [string, ...string[]];

const uploadSchema = z.object({
  jenis: z.enum(jenisIds),
  catatan: z.string().max(2000).optional(),
  fileUrl: z.string().url(),
  fileName: z.string().min(1).max(255),
});

function blobValid(url: string) {
  try {
    return new URL(url).hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export async function simpanUpload(data: z.infer<typeof uploadSchema>): Promise<UploadState> {
  const user = await wajibMahasiswa();
  const parsed = uploadSchema.safeParse(data);
  if (!parsed.success) return { error: 'Data berkas tidak lengkap.' };
  if (!blobValid(parsed.data.fileUrl)) return { error: 'Lokasi berkas tidak valid.' };
  let teks: string | null = null;
  try {
    const res = await fetch(parsed.data.fileUrl);
    teks = await ekstrakTeks(Buffer.from(await res.arrayBuffer()), parsed.data.fileName);
  } catch (err) {
    console.error('Gagal membaca berkas untuk ekstraksi teks', err);
  }
  const b = await simpanBerkasBaru(user.id, {
    jenis: parsed.data.jenis,
    sumber: 'upload',
    fileUrl: parsed.data.fileUrl,
    fileName: parsed.data.fileName,
    catatan: parsed.data.catatan || null,
    teks,
  });
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
  const ekspor = await eksporGdocs(id);
  if (!ekspor) {
    return {
      error: 'Dokumen belum bisa dibaca sistem. Di Google Docs, buka Bagikan → Akses umum → "Siapa saja yang memiliki link" sebagai Pelihat, lalu kirim ulang.',
    };
  }
  let fileUrl: string | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`gdocs/${user.nim}/${jenis}-${Date.now()}.pdf`, ekspor.pdf, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true,
    });
    fileUrl = blob.url;
  }
  const b = await simpanBerkasBaru(user.id, {
    jenis,
    sumber: 'gdocs',
    gdocsUrl: url,
    fileUrl,
    fileName: `${jenis}-salinan.pdf`,
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
