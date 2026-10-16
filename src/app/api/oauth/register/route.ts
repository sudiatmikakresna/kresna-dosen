import { jsonCors, opsi } from '@/lib/cors';
import { daftarKlien } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/** Dynamic Client Registration (RFC 7591). Hanya redirect ke Claude yang diterima. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonCors({ error: 'invalid_client_metadata', error_description: 'Body harus JSON.' }, { status: 400 });
  }
  const hasil = await daftarKlien(body);
  if ('error' in hasil) return jsonCors({ error: hasil.error, error_description: hasil.pesan }, { status: 400 });
  return jsonCors(hasil.data, { status: 201 });
}
export const OPTIONS = opsi;
