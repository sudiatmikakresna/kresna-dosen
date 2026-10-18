import 'server-only';

// WAHA berjalan di VPS (https://waha.kresna.blog); WAHA_URL adalah alamat itu.
// Aplikasi mengirim laporan ke WAHA; WAHA mengirim balik event pesan ke /api/whatsapp/webhook (lihat wa-pesan.ts).
export const sesi = () => process.env.WAHA_SESSION || 'default';
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

export async function kirimTeks(chatId: string, text: string, balasKe?: string) {
  return panggil<Record<string, unknown>>('/api/sendText', {
    method: 'POST',
    body: { session: sesi(), chatId, text, linkPreview: false, ...(balasKe ? { reply_to: balasKe } : {}) },
  });
}

/** Tampilkan / hentikan status "sedang mengetik..." di chat. Kedaluwarsa sendiri ±25 detik di WhatsApp. */
export async function mengetik(chatId: string, aktif: boolean) {
  return panggil<unknown>(aktif ? '/api/startTyping' : '/api/stopTyping', { method: 'POST', body: { session: sesi(), chatId }, timeoutMs: 8000 });
}

export type Media = { mimetype: string; data: Buffer; namaFile: string | null };

/**
 * Unduh lampiran sebuah pesan dari WAHA. Pakai `media.url` di payload webhook bila ada; bila tidak (unduh otomatis
 * mati), minta WAHA mengunduhnya lewat endpoint pesan. URL media dibangun WAHA dengan alamat internalnya, jadi
 * host-nya diganti dengan WAHA_URL.
 */
export async function ambilMedia(chatId: string, messageId: string, media?: { url?: unknown; mimetype?: unknown; filename?: unknown } | null, batasByte = 20 * 1024 * 1024): Promise<Media | null> {
  let m = media && typeof media.url === 'string' ? media : null;
  if (!m) {
    const pesan = await panggil<Record<string, unknown>>(
      `/api/${encodeURIComponent(sesi())}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}?downloadMedia=true`,
      { timeoutMs: 30000 },
    );
    const x = pesan.media as { url?: unknown; mimetype?: unknown; filename?: unknown } | undefined;
    m = x && typeof x.url === 'string' ? x : null;
  }
  if (!m) return null;
  const u = new URL(String(m.url), dasar() || 'http://localhost');
  const res = await fetch(`${dasar()}${u.pathname}${u.search}`, {
    headers: { 'x-api-key': process.env.WAHA_API_KEY! },
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`WAHA ${res.status} saat mengunduh lampiran.`);
  const panjang = Number(res.headers.get('content-length') ?? 0);
  if (panjang > batasByte) throw new Error('Lampiran terlalu besar.');
  const data = Buffer.from(await res.arrayBuffer());
  if (data.byteLength > batasByte) throw new Error('Lampiran terlalu besar.');
  const mimetype = (typeof m.mimetype === 'string' && m.mimetype) || res.headers.get('content-type') || '';
  return { mimetype: mimetype.split(';')[0].trim().toLowerCase(), data, namaFile: typeof m.filename === 'string' ? m.filename : null };
}

/** LID (ID tersembunyi WhatsApp, xxx@lid) untuk sebuah nomor; dipakai mengenali mention ke nomor bot di grup. */
export async function lidNomor(nomor: string) {
  const r = await panggil<{ lid?: string | null }>(`/api/${encodeURIComponent(sesi())}/lids/pn/${encodeURIComponent(nomor)}`, { timeoutMs: 8000 });
  return r.lid ?? null;
}

/** Ubah nomor (08xx, +62xx, 62xx) atau chat ID menjadi chat ID WhatsApp. */
export function chatIdDari(tujuan: string) {
  const t = tujuan.trim();
  if (t.includes('@')) return t;
  let n = t.replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (n.length < 8 || n.length > 16) throw new Error(`Nomor tidak valid: ${tujuan}`);
  return `${n}@c.us`;
}

/** Cek apakah nomor terdaftar di WhatsApp; chatId dari WAHA bisa berbeda dari tebakan (mis. nomor lama tanpa 9). */
export async function cekNomor(nomor: string) {
  const phone = chatIdDari(nomor).split('@')[0];
  const r = await panggil<{ numberExists?: boolean; chatId?: string }>(
    `/api/contacts/check-exists?phone=${encodeURIComponent(phone)}&session=${encodeURIComponent(sesi())}`,
    { timeoutMs: 15000 },
  );
  return { nomor: phone, terdaftar: r.numberExists === true, chatId: r.chatId ?? null };
}

export type RingkasChat = { id: string; nama: string | null; grup: boolean; pesanTerakhir: { waktu: Date | null; dariSaya: boolean; teks: string } | null };

/** Daftar chat terbaru (pribadi dan grup) beserta pesan terakhirnya. */
export async function daftarChat(batas = 20, offset = 0): Promise<RingkasChat[]> {
  const res = await panggil<unknown>(`/api/${encodeURIComponent(sesi())}/chats/overview?limit=${batas}&offset=${offset}`, { timeoutMs: 20000 });
  const daftar = Array.isArray(res) ? res : [];
  return daftar.flatMap((c) => {
    const r = c as Record<string, unknown>;
    const id = teksId(r.id);
    if (!id) return [];
    const akhir = r.lastMessage ? bacaPesan(r.lastMessage) : null;
    return [
      {
        id,
        nama: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null,
        grup: id.endsWith('@g.us'),
        pesanTerakhir: akhir && { waktu: akhir.waktu, dariSaya: akhir.dariSaya, teks: akhir.teks || (akhir.lampiran ? '[lampiran]' : '') },
      },
    ];
  });
}

/** Tandai pesan belum dibaca di satu chat sebagai sudah dibaca (centang biru). */
export async function tandaiDibaca(chatId: string) {
  return panggil<unknown>(`/api/${encodeURIComponent(sesi())}/chats/${encodeURIComponent(chatId)}/messages/read`, { method: 'POST', body: {} });
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

export type PesanChat = {
  id: string;
  /** Chat (grup) tempat pesan berada, bila bisa ditentukan dari payload. */
  chatId: string | null;
  waktu: Date | null;
  pengirim: string | null;
  pengirimId: string | null;
  dariSaya: boolean;
  teks: string;
  lampiran: boolean;
};

const nomorDari = (v: unknown) => (typeof v === 'string' && v.includes('@') ? v.split('@')[0].split(':')[0] : null);
const grupId = (v: unknown) => (typeof v === 'string' && v.endsWith('@g.us') ? v : null);

/**
 * Ubah satu pesan WAHA (respons API chats/messages maupun payload webhook message/message.any) ke bentuk aplikasi.
 * Bentuk _data berbeda antar-engine; kunci GOWS (Info.PushName, Info.SenderAlt, Info.Chat) dicoba lebih dulu.
 */
export function bacaPesan(p: unknown): PesanChat {
  const r = (p ?? {}) as Record<string, unknown>;
  const info = ((r._data as Record<string, unknown> | undefined)?.Info ?? {}) as Record<string, unknown>;
  const dariSaya = r.fromMe === true;
  const id = teksId(r.id) ?? `${r.timestamp}-${r.participant}`;
  // ID pesan berformat {fromMe}_{chatId}_{messageId}[_{participant}], jadi chat juga bisa dibaca dari sana.
  const chatId = grupId(r.from) ?? grupId(r.to) ?? grupId(info.Chat) ?? grupId(id.split('_')[1]);
  // Anggota grup sering hanya punya ID tersembunyi (@lid); nomor aslinya, bila ada, di SenderAlt.
  const nama = typeof info.PushName === 'string' && info.PushName.trim() ? info.PushName.trim() : null;
  const nomor = [info.SenderAlt, r.participant, info.Sender].map((v) => (typeof v === 'string' && !v.endsWith('@lid') ? nomorDari(v) : null)).find(Boolean);
  const pengirimId = [r.participant, info.Sender].find((v): v is string => typeof v === 'string' && v.includes('@')) ?? null;
  const detik = typeof r.timestamp === 'number' ? r.timestamp : typeof r.timestamp === 'string' ? Number(r.timestamp) : NaN;
  return {
    id,
    chatId,
    waktu: Number.isFinite(detik) && detik > 0 ? new Date(detik * 1000) : null,
    pengirim: dariSaya ? null : nama ?? nomor ?? null,
    pengirimId,
    dariSaya,
    teks: typeof r.body === 'string' ? r.body : '',
    lampiran: r.hasMedia === true,
  };
}

/**
 * Pesan terakhir di satu chat langsung dari WAHA, terbaru dulu. Hanya dipakai untuk menyalin riwayat lama ke database;
 * halaman riwayat membaca tabel wa_pesan. GOWS menyimpan pesan sejak sesi ditautkan, jadi riwayat sebelum scan QR tidak ada.
 */
export async function riwayatPesan(chatId: string, batas = 100): Promise<PesanChat[]> {
  const res = await panggil<unknown>(
    `/api/${encodeURIComponent(sesi())}/chats/${encodeURIComponent(chatId)}/messages?limit=${batas}&downloadMedia=false`,
    { timeoutMs: 20000 },
  );
  const daftar = Array.isArray(res) ? res : [];
  return daftar
    .map((p) => ({ ...bacaPesan(p), chatId }))
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
