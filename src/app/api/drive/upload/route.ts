import { randomUUID } from 'node:crypto';
import { and, eq, lt, max } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { berkas, db, uploadSesi } from '@/db';
import { penggunaSaatIni } from '@/lib/auth';
import { akunDrive, CHUNK, folderMahasiswa, mulaiUnggah } from '@/lib/google';
import { JENIS, labelJenisPendek } from '@/lib/labels';

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

const schema = z.object({
  jenis: z.enum(JENIS.map((j) => j.id) as [string, ...string[]]),
  fileName: z.string().min(1).max(200),
  ukuran: z.number().int().positive().max(20 * 1024 * 1024),
});

/** Mulai unggah: buat sesi resumable di folder Drive mahasiswa. */
export async function POST(req: Request) {
  const user = await penggunaSaatIni();
  if (!user || user.role !== 'mahasiswa') return NextResponse.json({ error: 'Silakan masuk sebagai mahasiswa.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Berkas harus PDF/DOCX dan maksimal 20 MB.' }, { status: 400 });
  const ext = parsed.data.fileName.toLowerCase().split('.').pop();
  if (ext !== 'pdf' && ext !== 'docx') return NextResponse.json({ error: 'Hanya PDF atau DOCX.' }, { status: 400 });
  if (!(await akunDrive())) {
    return NextResponse.json({ error: 'Dosen belum menghubungkan Google Drive. Hubungi dosen pembimbing.' }, { status: 503 });
  }
  try {
    // Bersihkan sesi unggah yang ditinggalkan lebih dari sehari.
    await db().delete(uploadSesi).where(lt(uploadSesi.createdAt, new Date(Date.now() - 86_400_000)));
    const folder = await folderMahasiswa(user);
    const [{ v }] = await db()
      .select({ v: max(berkas.versi) })
      .from(berkas)
      .where(and(eq(berkas.mahasiswaId, user.id), eq(berkas.jenis, parsed.data.jenis)));
    const nama = `${labelJenisPendek(parsed.data.jenis)} - v${(v ?? 0) + 1} - ${parsed.data.fileName}`;
    const uri = await mulaiUnggah(nama, folder, MIME[ext], parsed.data.ukuran);
    const id = randomUUID();
    await db().insert(uploadSesi).values({
      id, mahasiswaId: user.id, jenis: parsed.data.jenis, fileName: parsed.data.fileName,
      mime: MIME[ext], ukuran: parsed.data.ukuran, uri,
    });
    return NextResponse.json({ id, chunk: CHUNK });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Gagal menyiapkan unggahan ke Google Drive.' }, { status: 502 });
  }
}
