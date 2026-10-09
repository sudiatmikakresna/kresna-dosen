/** Alamat publik aplikasi. APP_URL dipakai bila diatur supaya redirect OAuth selalu sama. */
export function originPublik(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? new URL(req.url).host;
  const proto = h.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  return `${proto}://${host}`;
}
