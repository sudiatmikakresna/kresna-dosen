import { jsonCors, opsi } from '@/lib/cors';
import { metadataResource, RESOURCE, type JenisResource } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/** Metadata protected resource (RFC 9728) per server MCP, mis. /.well-known/oauth-protected-resource/api/waha/mcp. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = '/' + (await params).path.join('/');
  const r = (Object.keys(RESOURCE) as JenisResource[]).find((k) => RESOURCE[k].path === path);
  if (!r) return jsonCors({ error: 'Resource tidak dikenal.' }, { status: 404 });
  return jsonCors(metadataResource(r));
}
export const OPTIONS = opsi;
