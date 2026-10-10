import 'server-only';
import { eq, gt, sql } from 'drizzle-orm';
import { berkas, db, waGrup } from '@/db';
import { kirimTeks, wahaSiap } from './waha';

export async function grupTujuan() {
  return db().select().from(waGrup).where(eq(waGrup.diizinkan, true));
}

/** Jumlah berkas yang revisinya dikirim ke mahasiswa dalam beberapa jam terakhir (satu run review). */
export async function berkasDikirimBaruIni(jam = 3) {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(berkas)
    .where(gt(berkas.keputusanAt, sql`now() - make_interval(hours => ${jam})`));
  return r.n;
}

/** Kirim teks ke semua grup tujuan. Satu grup gagal tidak menghentikan grup lain. */
export async function kirimKeGrup(teks: string) {
  if (!wahaSiap()) throw new Error('WAHA_URL atau WAHA_API_KEY belum diatur di Vercel.');
  const grup = await grupTujuan();
  if (grup.length === 0) throw new Error('Belum ada grup tujuan. Pilih grup di Panel dosen → WhatsApp.');
  const hasil = await Promise.all(
    grup.map(async (g) => {
      try {
        await kirimTeks(g.chatId, teks);
        await db().update(waGrup).set({ terakhirAt: new Date() }).where(eq(waGrup.chatId, g.chatId));
        return { grup: g.nama ?? g.chatId, terkirim: true, error: null };
      } catch (e) {
        return { grup: g.nama ?? g.chatId, terkirim: false, error: (e as Error).message };
      }
    }),
  );
  return hasil;
}
