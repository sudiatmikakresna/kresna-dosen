import 'server-only';

// WAHA berjalan di laptop dosen dan dibuka lewat Cloudflare Tunnel; WAHA_URL adalah alamat tunnel itu.
// Aplikasi hanya mengirim pesan ke WAHA (satu arah); tidak ada webhook masuk.
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

export async function kirimTeks(chatId: string, text: string) {
  await panggil('/api/sendText', { method: 'POST', body: { session: sesi(), chatId, text, linkPreview: false } });
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

export type PesanChat = { id: string; waktu: Date | null; pengirim: string | null; dariSaya: boolean; teks: string; lampiran: boolean };

const nomorDari = (v: unknown) => (typeof v === 'string' && v.includes('@') ? v.split('@')[0].split(':')[0] : null);

/**
 * Pesan terakhir di satu chat, terbaru dulu. Hanya dibaca saat diminta; tidak ada yang disimpan di aplikasi.
 * GOWS menyimpan pesan sejak sesi ditautkan, jadi riwayat sebelum scan QR tidak ada.
 */
export async function riwayatPesan(chatId: string, batas = 100): Promise<PesanChat[]> {
  const res = await panggil<unknown>(
    `/api/${encodeURIComponent(sesi())}/chats/${encodeURIComponent(chatId)}/messages?limit=${batas}&downloadMedia=false`,
    { timeoutMs: 20000 },
  );
  const daftar = Array.isArray(res) ? res : [];
  return daftar
    .map((p) => {
      const r = p as Record<string, unknown>;
      const info = ((r._data as Record<string, unknown> | undefined)?.Info ?? {}) as Record<string, unknown>;
      const dariSaya = r.fromMe === true;
      // Anggota grup sering hanya punya ID tersembunyi (@lid); nomor aslinya, bila ada, di SenderAlt.
      const nama = typeof info.PushName === 'string' && info.PushName.trim() ? info.PushName.trim() : null;
      const nomor = [info.SenderAlt, r.participant, info.Sender].map((v) => (typeof v === 'string' && !v.endsWith('@lid') ? nomorDari(v) : null)).find(Boolean);
      return {
        id: teksId(r.id) ?? `${r.timestamp}-${r.participant}`,
        waktu: typeof r.timestamp === 'number' ? new Date(r.timestamp * 1000) : null,
        pengirim: dariSaya ? null : nama ?? nomor ?? null,
        dariSaya,
        teks: typeof r.body === 'string' ? r.body : '',
        lampiran: r.hasMedia === true,
      };
    })
    .sort((a, b) => (b.waktu?.getTime() ?? 0) - (a.waktu?.getTime() ?? 0));
}

const teksId = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as { _serialized?: unknown })._serialized === 'string') return (v as { _serialized: string })._serialized;
  return null;
};

/** Daftar grup yang diikuti nomor bot. Bentuk respons berbeda antar-engine, jadi dibaca longgar. */
export async function daftarGrup(): Promise<{ id: string; nama: string | null }[]> {
  const res = await panggil<unknown>(`/api/${encodeURIComponent(sesi())}/groups?exclude=participants&sortBy=subject&sortOrder=asc`, { timeoutMs: 20000 });
  const daftar = Array.isArray(res) ? res : res && typeof res === 'object' ? Object.entries(res as Record<string, unknown>).map(([k, v]) => ({ ...(v as object), _kunci: k })) : [];
  return daftar.flatMap((g) => {
    const r = g as Record<string, unknown>;
    const id = teksId(r.id) ?? teksId(r.JID) ?? teksId(r.jid) ?? teksId(r._kunci);
    if (!id || !id.endsWith('@g.us')) return [];
    const nama = r.subject ?? r.name ?? r.Name;
    return [{ id, nama: typeof nama === 'string' && nama.trim() ? nama.trim() : null }];
  });
}
