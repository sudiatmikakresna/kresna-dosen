import 'server-only';
import { cariKlien, redirectSah, RESOURCE, resourceUrl, type JenisResource, type Klien } from '@/lib/oauth';

export type Permintaan = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

export type HasilValidasi =
  | { jenis: 'ok'; klien: Klien; redirectUri: string; resource: string; jenisResource: JenisResource[] }
  /** Klien atau redirect tidak sah: tampilkan galat, jangan redirect (RFC 6749 4.1.2.1). */
  | { jenis: 'halaman'; pesan: string }
  /** Permintaan salah tapi redirect sah: kembalikan galat ke klien. */
  | { jenis: 'redirect'; url: string };

export function urlKembali(redirectUri: string, params: Record<string, string | undefined>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

export async function validasi(p: Permintaan, iss: string): Promise<HasilValidasi> {
  const klien = p.client_id ? await cariKlien(p.client_id) : null;
  if (!klien) return { jenis: 'halaman', pesan: 'Klien OAuth tidak dikenal. Hapus lalu tambahkan ulang connector di Claude.' };
  if (!p.redirect_uri || !redirectSah(klien, p.redirect_uri)) return { jenis: 'halaman', pesan: 'redirect_uri tidak terdaftar untuk klien ini.' };
  const balik = (error: string, error_description: string) => ({
    jenis: 'redirect' as const,
    url: urlKembali(p.redirect_uri!, { error, error_description, state: p.state, iss }),
  });
  if (p.response_type !== 'code') return balik('unsupported_response_type', 'response_type harus code.');
  if (!p.code_challenge || p.code_challenge_method !== 'S256') return balik('invalid_request', 'PKCE S256 wajib.');
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) return balik('invalid_request', 'code_challenge tidak valid.');

  // Wajib (MCP authorization spec, RFC 8707): token hanya berlaku untuk satu server MCP yang disebut di sini.
  if (!p.resource) return balik('invalid_target', 'Parameter resource wajib.');
  const cocok = (Object.keys(RESOURCE) as JenisResource[]).find((r) => resourceUrl(r) === p.resource!.replace(/\/$/, ''));
  if (!cocok) return balik('invalid_target', 'resource tidak dikenal.');
  const resource = resourceUrl(cocok);
  const jenisResource = [cocok];
  return { jenis: 'ok', klien, redirectUri: p.redirect_uri, resource, jenisResource };
}
