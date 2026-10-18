import 'server-only';
import { waitUntil } from '@vercel/functions';
import { asc, eq } from 'drizzle-orm';
import { botUji, db } from '@/db';
import { jawabUji } from './bot-wa';

/** Lulus bila status sesuai harapan dan, untuk "dijawab", jawabannya memuat teks `mengandung` (tanpa beda huruf besar-kecil). */
export function nilaiUji(u: { harapan: string; mengandung: string | null }, status: string, jawaban: string) {
  if (u.harapan === 'ditolak') return status === 'di_luar_topik';
  return status === 'dijawab' && (!u.mengandung || jawaban.toLowerCase().includes(u.mengandung.toLowerCase()));
}

/** Tandai semua kasus "berjalan", lalu jalankan berurutan di latar (waitUntil). Mengembalikan jumlah kasus. */
export async function jalankanSemuaUji() {
  const semua = await db().select().from(botUji).orderBy(asc(botUji.id));
  await db().update(botUji).set({ hasilStatus: 'berjalan', lulus: null, hasilJawaban: null });
  waitUntil(
    (async () => {
      for (const u of semua) {
        try {
          const h = await jawabUji(u.pertanyaan, u.chatId);
          await db()
            .update(botUji)
            .set({ hasilStatus: h.status, hasilJawaban: h.jawaban, lulus: nilaiUji(u, h.status, h.jawaban), biayaUsd: Math.round(h.biaya * 1_000_000), dijalankanAt: new Date() })
            .where(eq(botUji.id, u.id));
        } catch (e) {
          await db()
            .update(botUji)
            .set({ hasilStatus: 'gagal', hasilJawaban: (e as Error).message.slice(0, 500), lulus: false, dijalankanAt: new Date() })
            .where(eq(botUji.id, u.id));
        }
      }
    })(),
  );
  return semua.length;
}
