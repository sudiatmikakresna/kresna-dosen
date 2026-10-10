import 'server-only';

// WAHA berjalan di laptop dosen dan dibuka lewat Cloudflare Tunnel; WAHA_URL adalah alamat tunnel itu.
const sesi = () => process.env.WAHA_SESSION || 'default';
const dasar = () => (process.env.WAHA_URL ?? '').replace(/\/$/, '');

export const wahaSiap = () => !!process.env.WAHA_URL && !!process.env.WAHA_API_KEY;

async function panggil<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  if (!wahaSiap()) throw new Error('WAHA_URL atau WAHA_API_KEY belum diatur.');
  const res = await fetch(`${dasar()}${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'x-api-key': process.env.WAHA_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
    signal: AbortSignal.timeout(init?.timeoutMs ?? 15000),
  });
  if (!res.ok) {
    const teks = await res.text().catch(() => '');
    throw new Error(`WAHA ${res.status} pada ${path}: ${teks.slice(0, 200)}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? await res.json() : await res.text()) as T;
}

export type StatusSesi = { status: string; me: { id: string; pushName?: string } | null; error: string | null };

/** Status sesi WhatsApp di WAHA (WORKING, SCAN_QR_CODE, STOPPED, ...). */
export async function statusSesi(): Promise<StatusSesi> {
  try {
    const s = await panggil<{ status: string; me?: { id: string; pushName?: string } | null }>(`/api/sessions/${encodeURIComponent(sesi())}`, { timeoutMs: 8000 });
    return { status: s.status, me: s.me ?? null, error: null };
  } catch (e) {
    return { status: 'TIDAK_TERJANGKAU', me: null, error: (e as Error).message };
  }
}

export async function kirimTeks(chatId: string, text: string, replyTo?: string) {
  await panggil('/api/sendText', {
    method: 'POST',
    body: { session: sesi(), chatId, text, ...(replyTo ? { reply_to: replyTo } : {}), linkPreview: false },
  });
}

export async function mengetik(chatId: string, aktif: boolean) {
  try {
    await panggil(aktif ? '/api/startTyping' : '/api/stopTyping', { method: 'POST', body: { session: sesi(), chatId }, timeoutMs: 5000 });
  } catch {
    // Indikator mengetik hanya kosmetik.
  }
}

/** Nama grup dari WAHA. Bentuk respons berbeda antar-engine, jadi beberapa kunci dicoba. */
export async function namaGrup(chatId: string) {
  try {
    const g = await panggil<Record<string, unknown>>(`/api/${encodeURIComponent(sesi())}/groups/${encodeURIComponent(chatId)}`, { timeoutMs: 8000 });
    const nama = g.subject ?? g.name ?? g.Name ?? (g.groupMetadata as Record<string, unknown> | undefined)?.subject;
    return typeof nama === 'string' && nama.trim() ? nama.trim() : null;
  } catch {
    return null;
  }
}
