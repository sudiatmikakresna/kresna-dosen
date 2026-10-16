import 'server-only';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { verifikasiToken } from './mcp-token';
import { SCOPE, verifikasiAkses, type JenisResource } from './oauth';

/**
 * Verifikasi Bearer untuk server MCP: token panel (bmb_..., dipakai Claude Code lewat .mcp.json) atau access token OAuth
 * dari connector Claude (oat_..., audience harus server MCP ini).
 */
export async function verifikasiBearer(token: string | undefined, r: JenisResource): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  if (token.startsWith('bmb_')) {
    const hasil = await verifikasiToken(token);
    return hasil ? { token, clientId: `dosen:${hasil.dosen.id}`, scopes: [SCOPE], extra: { dosenId: hasil.dosen.id } } : undefined;
  }
  const o = await verifikasiAkses(token, r);
  return o ? { token, clientId: o.clientId, scopes: (o.scope ?? SCOPE).split(' '), extra: { dosenId: o.dosenId } } : undefined;
}
