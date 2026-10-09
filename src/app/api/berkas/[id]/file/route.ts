import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { berkas, db } from '@/db';
import { penggunaSaatIni } from '@/lib/auth';
import { BATAS_PRATINJAU, unduhFile } from '@/lib/google';

/** Pratinjau berkas dari Google Drive dosen, hanya untuk dosen dan mahasiswa pemiliknya. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await penggunaSaatIni();
  if (!user) return new NextResponse('Silakan masuk.', { status: 401 });
  const [b] = await db().select().from(berkas).where(eq(berkas.id, Number((await params).id))).limit(1);
  if (!b || !b.driveFileId || (user.role !== 'dosen' && b.mahasiswaId !== user.id)) {
    return new NextResponse('Berkas tidak ditemukan.', { status: 404 });
  }
  if ((b.ukuran ?? 0) > BATAS_PRATINJAU) {
    return new NextResponse('Berkas terlalu besar untuk pratinjau.', { status: 413 });
  }
  const res = await unduhFile(b.driveFileId);
  const nama = encodeURIComponent(b.fileName ?? 'berkas.pdf');
  return new NextResponse(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': `inline; filename*=UTF-8''${nama}`,
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
