import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { db, oauthKlien, oauthKode, oauthToken, users } from '@/db';
import { originAplikasi } from './picu-review';

/**
 * Server otorisasi OAuth 2.1 kecil untuk connector Claude (claude.ai, Desktop, mobile, Claude Code).
 * - Klien: Dynamic Client Registration (RFC 7591) atau Client ID Metadata Document (client_id berupa URL https).
 * - Alur: authorization code + PKCE S256, login memakai akun dosen aplikasi, lalu layar persetujuan.
 * - Token: access 1 jam, refresh 90 hari yang dirotasi setiap dipakai. Hanya hash yang disimpan.
 * Hanya redirect ke Claude yang diterima, jadi server ini tidak bisa dipakai aplikasi lain.
 */

export const SCOPE = 'mcp';
const ACCESS_DETIK = 60 * 60;
const REFRESH_HARI = 90;
const KODE_MENIT = 5;

export const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const acak = (awalan: string) => `${awalan}_${randomBytes(32).toString('base64url')}`;

export function origin() {
  const o = originAplikasi();
  if (!o) throw new Error('APP_URL belum diatur.');
  return o;
}

/** Server MCP yang dilindungi OAuth ini. Path dipakai juga untuk lokasi metadata RFC 9728. */
export const RESOURCE = {
  waha: { path: '/api/waha/mcp', nama: 'WhatsApp (WAHA)' },
  bimbingan: { path: '/api/mcp', nama: 'Bimbingan Skripsi' },
  siska: { path: '/api/siska/mcp', nama: 'SISKA (presensi kuliah)' },
} as const;
export type JenisResource = keyof typeof RESOURCE;

export const resourceUrl = (r: JenisResource) => `${origin()}${RESOURCE[r].path}`;
export const metadataPath = (r: JenisResource) => `/.well-known/oauth-protected-resource${RESOURCE[r].path}`;

export function metadataResource(r: JenisResource) {
  return {
    resource: resourceUrl(r),
    resource_name: RESOURCE[r].nama,
    authorization_servers: [origin()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
  };
}

export function metadataServer() {
  const o = origin();
  return {
    issuer: o,
    authorization_endpoint: `${o}/oauth/izin`,
    token_endpoint: `${o}/api/oauth/token`,
    registration_endpoint: `${o}/api/oauth/register`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE, 'offline_access'],
    client_id_metadata_document_supported: true,
  };
}

// ---------- Redirect URI dan klien ----------

const HOST_CLAUDE = new Set(['claude.ai', 'claude.com']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Redirect yang diizinkan: callback Claude (https) atau loopback Claude Code (http, port bebas). */
export function redirectDiizinkan(uri: string) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === 'https:') return HOST_CLAUDE.has(u.hostname);
    return u.protocol === 'http:' && LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
}

/** Cocokkan redirect dengan yang terdaftar. Loopback dicocokkan tanpa port (RFC 8252 7.3). */
function redirectCocok(diminta: string, terdaftar: string[]) {
  if (terdaftar.includes(diminta)) return true;
  try {
    const d = new URL(diminta);
    if (d.protocol !== 'http:' || !LOOPBACK.has(d.hostname)) return false;
    return terdaftar.some((t) => {
      const u = new URL(t);
      return u.protocol === 'http:' && LOOPBACK.has(u.hostname) && u.hostname === d.hostname && u.pathname === d.pathname;
    });
  } catch {
    return false;
  }
}

export type Klien = { clientId: string; nama: string; redirectUris: string[]; jenis: 'dcr' | 'cimd' };

/** Client ID Metadata Document: hanya dokumen yang di-host Anthropic (claude.ai / claude.com). */
async function klienCimd(clientId: string): Promise<Klien | null> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !HOST_CLAUDE.has(url.hostname) || url.pathname === '/') return null;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!res.ok) return null;
    const doc = (await res.json()) as { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown };
    if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
    const redirectUris = doc.redirect_uris.filter((u): u is string => typeof u === 'string' && redirectDiizinkan(u));
    if (!redirectUris.length) return null;
    return { clientId, nama: typeof doc.client_name === 'string' ? doc.client_name : url.hostname, redirectUris, jenis: 'cimd' };
  } catch {
    return null;
  }
}

export async function cariKlien(clientId: string): Promise<Klien | null> {
  if (!clientId) return null;
  if (clientId.startsWith('https://')) return klienCimd(clientId);
  const [k] = await db().select().from(oauthKlien).where(eq(oauthKlien.clientId, clientId)).limit(1);
  if (!k) return null;
  return { clientId: k.clientId, nama: k.nama ?? 'Klien MCP', redirectUris: k.redirectUris.split('\n').filter(Boolean), jenis: 'dcr' };
}

export const redirectSah = (klien: Klien, uri: string) => redirectDiizinkan(uri) && redirectCocok(uri, klien.redirectUris);

/** Dynamic Client Registration (RFC 7591). Klien publik saja (tanpa secret). */
export async function daftarKlien(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!uris.length) return { error: 'invalid_redirect_uri', pesan: 'redirect_uris wajib diisi.' } as const;
  const ditolak = uris.filter((u) => !redirectDiizinkan(u));
  if (ditolak.length) return { error: 'invalid_redirect_uri', pesan: `Redirect tidak diizinkan: ${ditolak.join(', ')}` } as const;
  const metode = b.token_endpoint_auth_method ?? 'none';
  if (metode !== 'none') return { error: 'invalid_client_metadata', pesan: 'Hanya klien publik (token_endpoint_auth_method=none).' } as const;
  const nama = typeof b.client_name === 'string' ? b.client_name.slice(0, 120) : null;
  // Batasi pendaftaran supaya endpoint publik ini tidak bisa dipakai membanjiri database.
  const [{ n }] = await db().select({ n: count() }).from(oauthKlien).where(gt(oauthKlien.createdAt, new Date(Date.now() - 3_600_000)));
  if (n >= 30) return { error: 'too_many_requests', pesan: 'Terlalu banyak pendaftaran klien. Coba lagi nanti.' } as const;
  const clientId = acak('kl');
  await db().insert(oauthKlien).values({ clientId, nama, redirectUris: uris.join('\n') });
  return {
    data: {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: nama ?? undefined,
      redirect_uris: uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  } as const;
}

// ---------- Kode otorisasi ----------

export async function buatKode(p: { clientId: string; dosenId: number; redirectUri: string; codeChallenge: string; scope: string | null; resource: string | null }) {
  const kode = acak('kd');
  await db()
    .insert(oauthKode)
    .values({ ...p, kodeHash: hash(kode), kedaluwarsaAt: new Date(Date.now() + KODE_MENIT * 60_000) });
  return kode;
}

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

function samaAman(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class GalatOauth extends Error {
  constructor(
    public kode: 'invalid_request' | 'invalid_grant' | 'invalid_client' | 'unsupported_grant_type' | 'invalid_target',
    pesan: string,
    public status = 400,
  ) {
    super(pesan);
  }
}

async function terbitkanToken(p: { dosenId: number; clientId: string; namaKlien: string | null; scope: string | null; resource: string | null }) {
  const access = acak('oat');
  const refresh = acak('ort');
  await db()
    .insert(oauthToken)
    .values({
      ...p,
      accessHash: hash(access),
      accessKedaluwarsaAt: new Date(Date.now() + ACCESS_DETIK * 1000),
      refreshHash: hash(refresh),
      refreshKedaluwarsaAt: new Date(Date.now() + REFRESH_HARI * 86_400_000),
    });
  return respons(access, refresh, p.scope);
}

const respons = (access: string, refresh: string, scope: string | null) => ({
  access_token: access,
  token_type: 'Bearer',
  expires_in: ACCESS_DETIK,
  refresh_token: refresh,
  scope: scope ?? SCOPE,
});

/** grant_type=authorization_code: kode sekali pakai, PKCE S256, client_id dan redirect_uri harus sama. */
export async function tukarKode(f: { code?: string; client_id?: string; redirect_uri?: string; code_verifier?: string; resource?: string }) {
  if (!f.code || !f.client_id || !f.code_verifier) throw new GalatOauth('invalid_request', 'code, client_id, dan code_verifier wajib.');
  const [k] = await db()
    .update(oauthKode)
    .set({ dipakaiAt: new Date() })
    .where(and(eq(oauthKode.kodeHash, hash(f.code)), isNull(oauthKode.dipakaiAt), gt(oauthKode.kedaluwarsaAt, new Date())))
    .returning();
  if (!k) throw new GalatOauth('invalid_grant', 'Kode tidak valid, kedaluwarsa, atau sudah dipakai.');
  if (k.clientId !== f.client_id) throw new GalatOauth('invalid_grant', 'client_id tidak sesuai.');
  if (f.redirect_uri && f.redirect_uri !== k.redirectUri) throw new GalatOauth('invalid_grant', 'redirect_uri tidak sesuai.');
  if (!samaAman(s256(f.code_verifier), k.codeChallenge)) throw new GalatOauth('invalid_grant', 'code_verifier tidak cocok.');
  if (f.resource && k.resource && f.resource !== k.resource) throw new GalatOauth('invalid_target', 'resource tidak sesuai.');
  const klien = await cariKlien(k.clientId);
  return terbitkanToken({ dosenId: k.dosenId, clientId: k.clientId, namaKlien: klien?.nama ?? null, scope: k.scope, resource: k.resource });
}

/** grant_type=refresh_token: refresh token dirotasi; yang lama langsung tidak berlaku. */
export async function perbaruiToken(f: { refresh_token?: string; client_id?: string }) {
  if (!f.refresh_token) throw new GalatOauth('invalid_request', 'refresh_token wajib.');
  const access = acak('oat');
  const refresh = acak('ort');
  const [t] = await db()
    .update(oauthToken)
    .set({
      accessHash: hash(access),
      accessKedaluwarsaAt: new Date(Date.now() + ACCESS_DETIK * 1000),
      refreshHash: hash(refresh),
      refreshKedaluwarsaAt: new Date(Date.now() + REFRESH_HARI * 86_400_000),
    })
    .where(
      and(
        eq(oauthToken.refreshHash, hash(f.refresh_token)),
        isNull(oauthToken.revokedAt),
        gt(oauthToken.refreshKedaluwarsaAt, new Date()),
        ...(f.client_id ? [eq(oauthToken.clientId, f.client_id)] : []),
      ),
    )
    .returning();
  if (!t) throw new GalatOauth('invalid_grant', 'Refresh token tidak valid, dicabut, atau kedaluwarsa.');
  return respons(access, refresh, t.scope);
}

/** Verifikasi access token OAuth untuk server MCP tertentu (audience = resource yang disetujui). */
export async function verifikasiAkses(token: string, r: JenisResource) {
  const [row] = await db()
    .select({ id: oauthToken.id, dosenId: oauthToken.dosenId, clientId: oauthToken.clientId, resource: oauthToken.resource, scope: oauthToken.scope, role: users.role })
    .from(oauthToken)
    .innerJoin(users, eq(users.id, oauthToken.dosenId))
    .where(and(eq(oauthToken.accessHash, hash(token)), isNull(oauthToken.revokedAt), gt(oauthToken.accessKedaluwarsaAt, new Date())))
    .limit(1);
  if (!row || row.role !== 'dosen') return null;
  // Token selalu terikat ke satu server MCP; token tanpa resource tidak berlaku di mana pun.
  if (!row.resource || row.resource.replace(/\/$/, '') !== resourceUrl(r)) return null;
  await db().update(oauthToken).set({ lastUsedAt: new Date() }).where(eq(oauthToken.id, row.id));
  return row;
}
