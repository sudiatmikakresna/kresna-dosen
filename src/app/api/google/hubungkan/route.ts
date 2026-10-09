import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { penggunaSaatIni } from '@/lib/auth';
import { urlOtorisasi } from '@/lib/google';
import { originPublik } from '@/lib/origin';

export async function GET(req: Request) {
  const user = await penggunaSaatIni();
  const origin = originPublik(req);
  if (!user || user.role !== 'dosen') return NextResponse.redirect(`${origin}/dosen/masuk`);
  const state = randomBytes(16).toString('base64url');
  const res = NextResponse.redirect(urlOtorisasi(`${origin}/api/google/callback`, state));
  res.cookies.set('g_state', state, { httpOnly: true, secure: origin.startsWith('https'), sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
