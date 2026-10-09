import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { db, users, type User } from '@/db';

const COOKIE = 'sesi';
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET belum diatur (minimal 32 karakter).');
  return new TextEncoder().encode(s);
}

export async function buatSesi(user: Pick<User, 'id' | 'role'>) {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function hapusSesi() {
  (await cookies()).delete(COOKIE);
}

export async function penggunaSaatIni(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = Number(payload.sub);
    if (!id) return null;
    const [user] = await db().select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

export async function wajibMahasiswa() {
  const user = await penggunaSaatIni();
  if (!user || user.role !== 'mahasiswa') redirect('/masuk');
  return user;
}

export async function wajibDosen() {
  const user = await penggunaSaatIni();
  if (!user || user.role !== 'dosen') redirect('/dosen/masuk');
  return user;
}
