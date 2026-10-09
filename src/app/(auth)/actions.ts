'use server';

import bcrypt from 'bcryptjs';
import { eq, count } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, users } from '@/db';
import { buatSesi, hapusSesi } from '@/lib/auth';
import { catatAktivitas } from '@/lib/service';

export type FormState = { error?: string } | undefined;

const daftarSchema = z
  .object({
    nim: z.string().trim().regex(/^[0-9A-Za-z.\-]{5,20}$/, 'NIM tidak valid.'),
    nama: z.string().trim().min(3, 'Nama terlalu pendek.').max(120),
    password: z.string().min(8, 'Password minimal 8 karakter.').max(128),
    password2: z.string(),
  })
  .refine((d) => d.password === d.password2, { message: 'Ulangi password tidak sama.' });

export async function daftar(_: FormState, form: FormData): Promise<FormState> {
  const parsed = daftarSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { nim, nama, password } = parsed.data;
  const [ada] = await db().select({ id: users.id }).from(users).where(eq(users.nim, nim)).limit(1);
  if (ada) return { error: 'NIM sudah terdaftar. Silakan masuk.' };
  const [user] = await db()
    .insert(users)
    .values({ role: 'mahasiswa', nim, nama, passwordHash: await bcrypt.hash(password, 10) })
    .returning();
  await catatAktivitas(user.id, 'Mendaftar ke sistem bimbingan');
  await buatSesi(user);
  redirect('/mahasiswa');
}

export async function masuk(_: FormState, form: FormData): Promise<FormState> {
  const nim = String(form.get('nim') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const [user] = await db().select().from(users).where(eq(users.nim, nim)).limit(1);
  if (!user || user.role !== 'mahasiswa' || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'NIM atau password salah.' };
  }
  await buatSesi(user);
  redirect('/mahasiswa');
}

export async function masukDosen(_: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get('username') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const [user] = await db().select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || user.role !== 'dosen' || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'Username atau password salah.' };
  }
  await buatSesi(user);
  redirect('/dosen');
}

export async function adaDosen() {
  const [{ n }] = await db().select({ n: count() }).from(users).where(eq(users.role, 'dosen'));
  return n > 0;
}

const setupSchema = z.object({
  kunci: z.string(),
  nama: z.string().trim().min(3, 'Nama terlalu pendek.'),
  username: z.string().trim().regex(/^[a-z0-9._-]{3,32}$/, 'Username 3–32 karakter: huruf kecil, angka, titik, strip.'),
  password: z.string().min(10, 'Password dosen minimal 10 karakter.'),
});

export async function setupDosen(_: FormState, form: FormData): Promise<FormState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const kunci = process.env.SETUP_KEY;
  if (!kunci || parsed.data.kunci !== kunci) return { error: 'Kunci setup salah.' };
  if (await adaDosen()) return { error: 'Akun dosen sudah dibuat. Silakan masuk.' };
  const [user] = await db()
    .insert(users)
    .values({
      role: 'dosen',
      username: parsed.data.username,
      nama: parsed.data.nama,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    })
    .returning();
  await buatSesi(user);
  redirect('/dosen');
}

export async function keluar() {
  await hapusSesi();
  redirect('/masuk');
}
