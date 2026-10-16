import { jsonCors, opsi } from '@/lib/cors';
import { GalatOauth, perbaruiToken, tukarKode } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/** Token endpoint OAuth: authorization_code (PKCE) dan refresh_token. Menerima form-urlencoded (RFC 6749) atau JSON. */
export async function POST(req: Request) {
  const ct = req.headers.get('content-type') ?? '';
  let f: Record<string, string>;
  try {
    f = ct.includes('application/json')
      ? Object.fromEntries(Object.entries((await req.json()) as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : Object.fromEntries(new URLSearchParams(await req.text()));
  } catch {
    return jsonCors({ error: 'invalid_request', error_description: 'Body tidak bisa dibaca.' }, { status: 400 });
  }
  // Klien publik tidak punya secret, tapi bila client_id dikirim lewat Basic auth, baca dari sana.
  const basic = req.headers.get('authorization');
  if (!f.client_id && basic?.startsWith('Basic ')) {
    f.client_id = decodeURIComponent(Buffer.from(basic.slice(6), 'base64').toString().split(':')[0] ?? '');
  }
  try {
    if (f.grant_type === 'authorization_code') return jsonCors(await tukarKode(f));
    if (f.grant_type === 'refresh_token') return jsonCors(await perbaruiToken(f));
    throw new GalatOauth('unsupported_grant_type', 'grant_type harus authorization_code atau refresh_token.');
  } catch (e) {
    if (e instanceof GalatOauth) return jsonCors({ error: e.kode, error_description: e.message }, { status: e.status });
    console.error('OAuth token gagal', e);
    return jsonCors({ error: 'server_error' }, { status: 500 });
  }
}
export const OPTIONS = opsi;
