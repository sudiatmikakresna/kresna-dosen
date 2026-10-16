import 'server-only';

// Klien HTTP untuk SISKA (Laravel + Inertia.js) memakai cookie dosen, dibawa dari repo absensi-siska.
// Cukup cookie `remember_web_*`: SISKA membuat sesi baru darinya.

export class SiskaError extends Error {}

type InertiaPage = { component: string; props: Record<string, any>; url: string; version: string };

class SiskaClient {
  private cookies = new Map<string, string>();
  private inertiaVersion: string | null = null;

  constructor(cookieHeader: string, private baseUrl: string) {
    for (const part of cookieHeader.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) this.cookies.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
  }

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private storeCookies(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  // Server kadang mengirim http:// di Location, jadi selalu diselesaikan terhadap baseUrl.
  private resolve(pathOrUrl: string) {
    const u = new URL(pathOrUrl, this.baseUrl);
    return new URL(u.pathname + u.search, this.baseUrl).toString();
  }

  private async request(method: string, path: string, headers: Record<string, string>, body?: unknown) {
    const h: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest', Cookie: this.cookieHeader(), ...headers };
    const xsrf = this.cookies.get('XSRF-TOKEN');
    if (xsrf) h['X-XSRF-TOKEN'] = decodeURIComponent(xsrf);
    if (body !== undefined) h['Content-Type'] = 'application/json';

    const res = await fetch(this.resolve(path), {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      cache: 'no-store',
    });
    this.storeCookies(res);

    const loc = res.headers.get('location') ?? '';
    if (res.status === 401 || /sso\.primakara|\/login/.test(loc)) {
      throw new SiskaError('Sesi SISKA habis. Perbarui SISKA_COOKIE (cookie remember_web_...).');
    }
    if (res.status === 419) throw new SiskaError('CSRF token SISKA tidak valid (419).');
    return res;
  }

  async json<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.request(method, path, { Accept: 'application/json' }, body);
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new SiskaError(`Respons SISKA bukan JSON (HTTP ${res.status}).`);
    }
    if (!res.ok) throw new SiskaError(data?.message || data?.error || `HTTP ${res.status}`);
    return data as T;
  }

  private async loadVersion() {
    const res = await this.request('GET', '/dosen', { Accept: 'text/html' });
    const m = (await res.text()).match(/data-page="([^"]+)"/);
    if (!m) throw new SiskaError(`Tidak bisa membaca versi Inertia (HTTP ${res.status}).`);
    this.inertiaVersion = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')).version;
  }

  private async inertiaGet(path: string, retry = true): Promise<InertiaPage> {
    if (!this.inertiaVersion) await this.loadVersion();
    const res = await this.request('GET', path, {
      Accept: 'text/html, application/xhtml+xml',
      'X-Inertia': 'true',
      'X-Inertia-Version': this.inertiaVersion!,
    });
    if (res.status === 409 && retry) {
      this.inertiaVersion = null;
      return this.inertiaGet(path, false);
    }
    if (res.status >= 300 && res.status < 400) return this.inertiaGet(res.headers.get('location')!, retry);
    if (!res.ok) throw new SiskaError(`HTTP ${res.status} pada ${path}`);
    return (await res.json()) as InertiaPage;
  }

  async page(path: string): Promise<Record<string, any>> {
    return (await this.inertiaGet(path)).props;
  }

  async inertiaPost(path: string, body: Record<string, unknown>) {
    if (!this.inertiaVersion) await this.loadVersion();
    const res = await this.request('POST', path, {
      Accept: 'text/html, application/xhtml+xml',
      'X-Inertia': 'true',
      'X-Inertia-Version': this.inertiaVersion!,
    }, body);
    const page = res.status >= 300 && res.status < 400
      ? await this.inertiaGet(res.headers.get('location')!)
      : ((await res.json()) as InertiaPage);
    const p = page.props ?? {};
    const errors = p.errors && Object.keys(p.errors).length ? p.errors : null;
    if (errors || p.flashError) {
      throw new SiskaError(p.flashError ?? Object.values(errors as Record<string, string>).join(' '));
    }
  }
}

export const siskaSiap = () => !!process.env.SISKA_COOKIE;

const g = globalThis as unknown as { siska?: SiskaClient };

export function siska() {
  if (!g.siska) {
    const cookie = process.env.SISKA_COOKIE;
    if (!cookie) throw new SiskaError('SISKA_COOKIE belum diatur di Vercel.');
    g.siska = new SiskaClient(cookie, process.env.SISKA_BASE_URL ?? 'https://siska.primakara.ac.id');
  }
  return g.siska;
}
