/** CORS terbuka untuk endpoint metadata dan OAuth publik (tidak memakai cookie). */
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version',
};
export const opsi = () => new Response(null, { status: 204, headers: CORS });
export const jsonCors = (data: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
  Response.json(data, { status: init?.status ?? 200, headers: { ...CORS, 'cache-control': 'no-store', ...init?.headers } });
