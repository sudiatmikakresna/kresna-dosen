import { NextResponse, type NextRequest } from 'next/server';
import { penggunaSaatIni } from '@/lib/auth';
import { hubungkan } from '@/lib/google';
import { originPublik } from '@/lib/origin';

export async function GET(req: NextRequest) {
  const origin = originPublik(req);
  const kembali = (q: string) => {
    const res = NextResponse.redirect(`${origin}/dosen/drive?${q}`);
    res.cookies.delete('g_state');
    return res;
  };
  const user = await penggunaSaatIni();
  if (!user || user.role !== 'dosen') return NextResponse.redirect(`${origin}/dosen/masuk`);
  const url = req.nextUrl;
  if (url.searchParams.get('error')) return kembali(`error=${encodeURIComponent('Izin Google dibatalkan.')}`);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!code || !state || state !== req.cookies.get('g_state')?.value) {
    return kembali(`error=${encodeURIComponent('Sesi otorisasi tidak valid. Coba lagi.')}`);
  }
  try {
    await hubungkan(user.id, code, `${origin}/api/google/callback`);
    return kembali('ok=1');
  } catch (e) {
    return kembali(`error=${encodeURIComponent((e as Error).message)}`);
  }
}
