import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, googleAkun, users, type User } from '@/db';

// Alamat bisa diganti lewat env hanya untuk pengujian lokal.
const OAUTH = process.env.GOOGLE_OAUTH_BASE ?? 'https://oauth2.googleapis.com';
const API = process.env.GOOGLE_API_BASE ?? 'https://www.googleapis.com';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];
const FOLDER = 'application/vnd.google-apps.folder';

/** Ukuran potongan unggah: kelipatan 256 KiB dan di bawah batas body 4,5 MB Vercel. */
export const CHUNK = 2 * 1024 * 1024;
/** Batas ukuran yang bisa dikirim balik lewat fungsi Vercel untuk pratinjau. */
export const BATAS_PRATINJAU = 4 * 1024 * 1024;

export const driveViewUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
export const drivePreviewUrl = (id: string) => `https://drive.google.com/file/d/${id}/preview`;

function kunci() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET belum diatur.');
  return createHash('sha256').update(`${s}:google-drive`).digest();
}

function enkripsi(teks: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', kunci(), iv);
  const isi = Buffer.concat([c.update(teks, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), isi].map((b) => b.toString('base64url')).join('.');
}

function dekripsi(data: string) {
  const [iv, tag, isi] = data.split('.').map((b) => Buffer.from(b, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', kunci(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(isi), d.final()]).toString('utf8');
}

function klien() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum diatur.');
  return { id, secret };
}

export function googleSiap() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function urlOtorisasi(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: klien().id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (process.env.GOOGLE_HD) p.set('hd', process.env.GOOGLE_HD);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function token(body: Record<string, string>) {
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: klien().id, client_secret: klien().secret, ...body }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google menolak token: ${json.error_description ?? json.error ?? res.status}`);
  return json as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
}

/** Tukar kode OAuth, simpan akun, dan siapkan folder utama "Bimbingan Skripsi". */
export async function hubungkan(dosenId: number, code: string, redirectUri: string) {
  const t = await token({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  if (!t.refresh_token) throw new Error('Google tidak mengirim refresh token. Coba hubungkan ulang.');
  const payload = t.id_token ? JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString()) : {};
  const email = String(payload.email ?? 'akun Google');
  cache = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  const root = await buatFolder('Bimbingan Skripsi', undefined, t.access_token);
  await db().delete(googleAkun).where(eq(googleAkun.dosenId, dosenId));
  await db().insert(googleAkun).values({ dosenId, email, refreshTokenEnc: enkripsi(t.refresh_token), rootFolderId: root });
  // Folder mahasiswa lama berada di akun sebelumnya, jadi dibuat ulang saat dibutuhkan.
  await db().update(users).set({ driveFolderId: null });
}

export async function putuskan(dosenId: number) {
  const [akun] = await db().select().from(googleAkun).where(eq(googleAkun.dosenId, dosenId)).limit(1);
  if (!akun) return;
  try {
    await fetch(`${OAUTH}/revoke?token=${encodeURIComponent(dekripsi(akun.refreshTokenEnc))}`, { method: 'POST' });
  } catch {}
  await db().delete(googleAkun).where(eq(googleAkun.id, akun.id));
  cache = null;
}

export async function akunDrive() {
  const [akun] = await db().select().from(googleAkun).limit(1);
  return akun ?? null;
}

let cache: { token: string; exp: number } | null = null;

async function aksesToken(paksa = false) {
  if (!paksa && cache && cache.exp > Date.now()) return cache.token;
  const akun = await akunDrive();
  if (!akun) throw new Error('Google Drive dosen belum dihubungkan.');
  const t = await token({ refresh_token: dekripsi(akun.refreshTokenEnc), grant_type: 'refresh_token' });
  cache = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  return t.access_token;
}

async function gfetch(url: string, init: RequestInit = {}, tokenTetap?: string): Promise<Response> {
  const kirim = async (tk: string) =>
    fetch(url.startsWith('http') ? url : `${API}${url}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${tk}` },
      cache: 'no-store',
    });
  let res = await kirim(tokenTetap ?? (await aksesToken()));
  if (res.status === 401 && !tokenTetap) res = await kirim(await aksesToken(true));
  return res;
}

async function gagal(res: Response, aksi: string): Promise<never> {
  const teks = await res.text().catch(() => '');
  throw new Error(`Google Drive gagal ${aksi} (${res.status}): ${teks.slice(0, 300)}`);
}

async function buatFolder(nama: string, parent?: string, tokenTetap?: string) {
  const res = await gfetch(
    '/drive/v3/files?fields=id&supportsAllDrives=true',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nama, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
    },
    tokenTetap,
  );
  if (!res.ok) await gagal(res, 'membuat folder');
  return ((await res.json()) as { id: string }).id;
}

/** Folder per mahasiswa: "NIM - Nama" di dalam folder utama. */
export async function folderMahasiswa(m: Pick<User, 'id' | 'nim' | 'nama' | 'driveFolderId'>) {
  if (m.driveFolderId) return m.driveFolderId;
  const akun = await akunDrive();
  if (!akun) throw new Error('Google Drive dosen belum dihubungkan.');
  const id = await buatFolder(`${m.nim} - ${m.nama}`, akun.rootFolderId);
  await db().update(users).set({ driveFolderId: id }).where(eq(users.id, m.id));
  return id;
}

/** Mulai sesi unggah resumable; mengembalikan URI sesi dari Google. */
export async function mulaiUnggah(nama: string, parent: string, mime: string, ukuran: number) {
  const res = await gfetch('/upload/drive/v3/files?uploadType=resumable&fields=id,size&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': mime,
      'x-upload-content-length': String(ukuran),
    },
    body: JSON.stringify({ name: nama, parents: [parent] }),
  });
  if (!res.ok) await gagal(res, 'memulai unggahan');
  const uri = res.headers.get('location');
  if (!uri) throw new Error('Google Drive tidak mengembalikan alamat sesi unggah.');
  return uri;
}

/** Kirim satu potongan. Selesai → id file; belum → offset berikutnya. */
export async function kirimPotongan(uri: string, data: Uint8Array, mulai: number, total: number) {
  const akhir = mulai + data.byteLength - 1;
  const res = await gfetch(uri, {
    method: 'PUT',
    headers: { 'content-range': `bytes ${mulai}-${akhir}/${total}`, 'content-length': String(data.byteLength) },
    body: data as BodyInit,
  });
  if (res.status === 308) {
    const range = res.headers.get('range');
    return { selesai: false as const, berikutnya: range ? Number(range.split('-')[1]) + 1 : 0 };
  }
  if (!res.ok) await gagal(res, 'mengunggah potongan');
  const file = (await res.json()) as { id: string };
  return { selesai: true as const, fileId: file.id };
}

/** Unggah buffer dari server (dipakai untuk salinan PDF Google Docs). */
export async function unggahBuffer(nama: string, parent: string, mime: string, data: Buffer) {
  const uri = await mulaiUnggah(nama, parent, mime, data.byteLength);
  const hasil = await kirimPotongan(uri, new Uint8Array(data), 0, data.byteLength);
  if (!hasil.selesai) throw new Error('Unggahan ke Google Drive belum selesai.');
  return hasil.fileId;
}

export async function infoFile(fileId: string) {
  const res = await gfetch(`/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType,parents&supportsAllDrives=true`);
  if (!res.ok) await gagal(res, 'membaca info file');
  return (await res.json()) as { id: string; name: string; size?: string; mimeType: string; parents?: string[] };
}

export async function unduhFile(fileId: string) {
  const res = await gfetch(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  if (!res.ok) await gagal(res, 'mengunduh file');
  return res;
}
