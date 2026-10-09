import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db, mcpTokens, users } from '@/db';

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export function buatToken() {
  const token = `bmb_${randomBytes(24).toString('base64url')}`;
  return { token, prefix: token.slice(0, 10), tokenHash: hashToken(token) };
}

/** Cek token Bearer MCP. Mengembalikan dosen pemilik token, atau null. */
export async function verifikasiToken(token: string) {
  const [row] = await db()
    .select({ tokenId: mcpTokens.id, dosen: users })
    .from(mcpTokens)
    .innerJoin(users, eq(users.id, mcpTokens.dosenId))
    .where(and(eq(mcpTokens.tokenHash, hashToken(token)), isNull(mcpTokens.revokedAt)))
    .limit(1);
  if (!row || row.dosen.role !== 'dosen') return null;
  await db().update(mcpTokens).set({ lastUsedAt: new Date() }).where(eq(mcpTokens.id, row.tokenId));
  return row;
}
