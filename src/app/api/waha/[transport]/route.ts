import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { db, waGrup } from '@/db';
import { verifikasiBearer } from '@/lib/mcp-auth';
import { metadataPath } from '@/lib/oauth';
import { pesanTersimpan } from '@/lib/wa-pesan';
import { chatIdDari, cekNomor, daftarChat, daftarGrup, kirimTeks, riwayatPesan, statusSesi, tandaiDibaca, wahaSiap } from '@/lib/waha';

export const maxDuration = 60;

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const gagal = (pesan: string) => ({ content: [{ type: 'text' as const, text: pesan }], isError: true });
const BACA = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;

/** Bungkus handler tool: cek WAHA siap dan ubah galat menjadi pesan untuk Claude. */
const aman =
  <A,>(fn: (args: A) => Promise<ReturnType<typeof json>>) =>
  async (args: A) => {
    if (!wahaSiap()) return gagal('WAHA_URL atau WAHA_API_KEY belum diatur di Vercel.');
    try {
      return await fn(args);
    } catch (e) {
      return gagal((e as Error).message);
    }
  };

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'status_whatsapp',
      {
        title: 'Status WhatsApp',
        description: 'Status sesi WhatsApp di WAHA (WORKING, SCAN_QR_CODE, STOPPED, ...) dan nomor yang tertaut. Panggil dulu bila tool lain gagal.',
        inputSchema: {},
        annotations: BACA,
      },
      aman(async () => {
        const s = await statusSesi();
        return json({ status: s.status, nomor: s.me?.id.split('@')[0] ?? null, nama: s.me?.pushName ?? null, error: s.error });
      }),
    );

    server.registerTool(
      'daftar_chat',
      {
        title: 'Daftar chat terbaru',
        description: 'Chat terbaru (pribadi dan grup) beserta pesan terakhirnya, terbaru dulu. Pakai chat_id dari sini untuk baca_pesan atau kirim_pesan.',
        inputSchema: { batas: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) },
        annotations: BACA,
      },
      aman(async ({ batas, offset }: { batas: number; offset: number }) => json(await daftarChat(batas, offset))),
    );

    server.registerTool(
      'daftar_grup',
      {
        title: 'Daftar grup WhatsApp',
        description: 'Semua grup yang diikuti nomor ini. tujuan_laporan=true untuk grup bimbingan yang dipilih di panel dosen.',
        inputSchema: {},
        annotations: BACA,
      },
      aman(async () => {
        const [grup, tujuan] = await Promise.all([daftarGrup(), db().select().from(waGrup)]);
        const t = new Set(tujuan.filter((g) => g.diizinkan).map((g) => g.chatId));
        return json(grup.map((g) => ({ chat_id: g.id, nama: g.nama, tujuan_laporan: t.has(g.id) })));
      }),
    );

    server.registerTool(
      'baca_pesan',
      {
        title: 'Baca pesan chat',
        description:
          'Pesan terakhir di satu chat langsung dari WAHA, urut lama ke baru. chat_id seperti 62812xxxx@c.us, ...@g.us, atau ...@lid; ' +
          'boleh juga nomor telepon (08xx/62xx). Riwayat hanya ada sejak nomor ditautkan ke WAHA.',
        inputSchema: { chat_id: z.string().min(3), batas: z.number().int().min(1).max(200).default(30) },
        annotations: BACA,
      },
      aman(async ({ chat_id, batas }: { chat_id: string; batas: number }) => {
        const id = chatIdDari(chat_id);
        const pesan = await riwayatPesan(id, batas);
        return json({
          chat_id: id,
          pesan: pesan.reverse().map((p) => ({
            message_id: p.id,
            waktu: p.waktu,
            pengirim: p.dariSaya ? 'saya' : p.pengirim ?? p.pengirimId,
            teks: p.teks,
            lampiran: p.lampiran,
          })),
        });
      }),
    );

    server.registerTool(
      'riwayat_grup_tersimpan',
      {
        title: 'Riwayat grup bimbingan (database)',
        description:
          'Pesan grup tujuan laporan yang tersimpan di database aplikasi lewat webhook, terbaru dulu. Tetap ada walaupun WAHA di-reset. ' +
          'Tanpa chat_id: grup tujuan pertama.',
        inputSchema: { chat_id: z.string().optional(), batas: z.number().int().min(1).max(500).default(50) },
        annotations: { ...BACA, openWorldHint: false },
      },
      async ({ chat_id, batas }) => {
        const tujuan = (await db().select().from(waGrup)).filter((g) => g.diizinkan);
        const g = chat_id ? tujuan.find((t) => t.chatId === chat_id) : tujuan[0];
        if (!g) return gagal('Grup bukan grup tujuan laporan. Lihat daftar_grup (tujuan_laporan=true).');
        const rows = await pesanTersimpan(g.chatId, batas);
        return json({
          grup: g.nama,
          chat_id: g.chatId,
          pesan: rows.map((p) => ({ waktu: p.waktu, pengirim: p.dariSaya ? 'saya' : p.pengirim ?? p.pengirimId, teks: p.teks, lampiran: p.lampiran })),
        });
      },
    );

    server.registerTool(
      'cek_nomor',
      {
        title: 'Cek nomor WhatsApp',
        description: 'Cek apakah nomor telepon terdaftar di WhatsApp dan dapatkan chat_id-nya. Format 08xx, +62xx, atau 62xx.',
        inputSchema: { nomor: z.string().min(6) },
        annotations: BACA,
      },
      aman(async ({ nomor }: { nomor: string }) => json(await cekNomor(nomor))),
    );

    server.registerTool(
      'kirim_pesan',
      {
        title: 'Kirim pesan WhatsApp',
        description:
          'Mengirim pesan teks dari nomor WhatsApp dosen ke satu chat (pribadi atau grup). tujuan: chat_id atau nomor telepon. ' +
          'Format WhatsApp: *tebal*, _miring_. Opsional balas_ke = message_id untuk membalas pesan tertentu. ' +
          'Pesan terkirim atas nama dosen; pastikan isi dan tujuan sudah benar sebelum memanggil. Kirim gambar/file belum didukung.',
        inputSchema: { tujuan: z.string().min(3), teks: z.string().min(1).max(4000), balas_ke: z.string().optional() },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      aman(async ({ tujuan, teks, balas_ke }: { tujuan: string; teks: string; balas_ke?: string }) => {
        let chatId = chatIdDari(tujuan);
        if (chatId.endsWith('@c.us')) {
          const c = await cekNomor(chatId);
          if (!c.terdaftar) return gagal(`Nomor ${c.nomor} tidak terdaftar di WhatsApp.`);
          chatId = c.chatId ?? chatId;
        }
        const r = await kirimTeks(chatId, teks, balas_ke);
        const id = (r?.id as { _serialized?: string } | string | undefined) ?? null;
        return json({ terkirim: true, chat_id: chatId, message_id: typeof id === 'string' ? id : id?._serialized ?? null });
      }),
    );

    server.registerTool(
      'tandai_dibaca',
      {
        title: 'Tandai chat dibaca',
        description: 'Menandai pesan belum dibaca di satu chat sebagai sudah dibaca (centang biru terlihat pengirim).',
        inputSchema: { chat_id: z.string().min(3) },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      aman(async ({ chat_id }: { chat_id: string }) => {
        await tandaiDibaca(chatIdDari(chat_id));
        return json({ ok: true });
      }),
    );
  },
  {
    serverInfo: { name: 'whatsapp-waha', version: '0.1.0' },
    instructions:
      'Remote WhatsApp lewat WAHA di nomor dosen. Baca dulu (daftar_chat, baca_pesan) sebelum membalas. ' +
      'kirim_pesan mengirim atas nama dosen, jadi konfirmasi isi dan tujuan dengan pengguna bila ada keraguan.',
  },
  { basePath: '/api/waha', maxDuration: 60, disableSse: true },
);

const authHandler = withMcpAuth(handler, (_req, bearer) => verifikasiBearer(bearer, 'waha'), {
  required: true,
  resourceMetadataPath: metadataPath('waha'),
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
