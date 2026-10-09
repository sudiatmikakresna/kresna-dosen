import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, uploadSesi } from '@/db';
import { penggunaSaatIni } from '@/lib/auth';
import { CHUNK, kirimPotongan } from '@/lib/google';

export const maxDuration = 60;

/** Terima satu potongan dari browser lalu teruskan ke sesi unggah Google Drive. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await penggunaSaatIni();
  if (!user || user.role !== 'mahasiswa') return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 });
  const { id } = await params;
  const [sesi] = await db()
    .select()
    .from(uploadSesi)
    .where(and(eq(uploadSesi.id, id), eq(uploadSesi.mahasiswaId, user.id)))
    .limit(1);
  if (!sesi) return NextResponse.json({ error: 'Sesi unggah tidak ditemukan.' }, { status: 404 });
  if (sesi.driveFileId) return NextResponse.json({ selesai: true });

  const offset = Number(new URL(req.url).searchParams.get('offset'));
  const data = new Uint8Array(await req.arrayBuffer());
  const akhir = offset + data.byteLength;
  const terakhir = akhir === sesi.ukuran;
  if (!Number.isInteger(offset) || offset < 0 || offset % CHUNK !== 0 || data.byteLength === 0 || data.byteLength > CHUNK || akhir > sesi.ukuran || (!terakhir && data.byteLength !== CHUNK)) {
    return NextResponse.json({ error: 'Potongan berkas tidak valid.' }, { status: 400 });
  }
  try {
    const hasil = await kirimPotongan(sesi.uri, data, offset, sesi.ukuran);
    if (hasil.selesai) {
      await db().update(uploadSesi).set({ driveFileId: hasil.fileId }).where(eq(uploadSesi.id, sesi.id));
      return NextResponse.json({ selesai: true });
    }
    return NextResponse.json({ selesai: false, berikutnya: hasil.berikutnya });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Gagal mengirim ke Google Drive. Coba unggah ulang.' }, { status: 502 });
  }
}
