'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, mcpTokens, waGrup } from '@/db';
import { wajibDosen } from '@/lib/auth';
import { buatToken } from '@/lib/mcp-token';
import { putuskan } from '@/lib/google';
import { deteksiChat, esc, kirimTelegram, putuskanTelegram, simpanChatManual } from '@/lib/telegram';
import { redirect } from 'next/navigation';
import { kirimKeGrup } from '@/lib/wa-laporan';
import { waitUntil } from '@vercel/functions';
import { jalankanReviewHarian, reviewAiSiap } from '@/lib/review-ai';
import { namaGrup } from '@/lib/waha';
import { kirimRevisi, setRingkasan, tambahRevisi, ubahRevisi } from '@/lib/service';

function segarkan(berkasId: number) {
  revalidatePath(`/dosen/berkas/${berkasId}`);
  revalidatePath('/dosen');
}

const revisiSchema = z.object({
  lokasi: z.string().trim().max(200),
  jenis: z.enum(['wajib', 'saran']),
  teks: z.string().trim().min(3, 'Catatan terlalu pendek.').max(4000),
});

export async function tambahCatatan(berkasId: number, form: FormData) {
  await wajibDosen();
  const parsed = revisiSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  await tambahRevisi(berkasId, [parsed.data], 'dosen');
  segarkan(berkasId);
}

export async function simpanCatatan(berkasId: number, revisiId: number, form: FormData) {
  await wajibDosen();
  const parsed = revisiSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  await ubahRevisi(revisiId, parsed.data);
  segarkan(berkasId);
}

export async function ubahStatusCatatan(berkasId: number, revisiId: number, status: 'draf' | 'dibuang') {
  await wajibDosen();
  await ubahRevisi(revisiId, { status });
  segarkan(berkasId);
}

export async function kirimKeMahasiswa(berkasId: number, form: FormData) {
  await wajibDosen();
  const keputusan = form.get('keputusan') === 'disetujui' ? 'disetujui' : 'perlu_revisi';
  const ringkasan = String(form.get('ringkasan') ?? '').trim();
  await kirimRevisi(berkasId, keputusan, ringkasan);
  segarkan(berkasId);
}

export async function simpanRingkasan(berkasId: number, form: FormData) {
  await wajibDosen();
  await setRingkasan(berkasId, String(form.get('ringkasan') ?? '').trim());
  segarkan(berkasId);
}

export type TokenState = { token?: string; error?: string } | undefined;

export async function buatTokenMcp(_: TokenState, form: FormData): Promise<TokenState> {
  const dosen = await wajibDosen();
  const nama = String(form.get('nama') ?? '').trim().slice(0, 60) || 'Token MCP';
  const { token, prefix, tokenHash } = buatToken();
  await db().insert(mcpTokens).values({ dosenId: dosen.id, nama, prefix, tokenHash });
  revalidatePath('/dosen/mcp');
  return { token };
}

export async function cabutToken(id: number) {
  const dosen = await wajibDosen();
  await db()
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpTokens.id, id), eq(mcpTokens.dosenId, dosen.id)));
  revalidatePath('/dosen/mcp');
}

export async function putuskanDrive() {
  const dosen = await wajibDosen();
  await putuskan(dosen.id);
  revalidatePath('/dosen/drive');
}

export async function deteksiTelegram() {
  await wajibDosen();
  let q = 'error=' + encodeURIComponent('Belum ada pesan ke bot. Buka bot di Telegram, tekan Start, lalu coba lagi.');
  try {
    const chat = await deteksiChat();
    if (chat) {
      await kirimTelegram(`✅ Notifikasi Bimbingan Skripsi aktif untuk <b>${esc(chat.nama)}</b>.`);
      q = 'ok=1';
    }
  } catch (e) {
    q = 'error=' + encodeURIComponent((e as Error).message);
  }
  revalidatePath('/dosen/telegram');
  redirect(`/dosen/telegram?${q}`);
}

export async function tesTelegram() {
  await wajibDosen();
  let q = 'tes=1';
  try {
    await kirimTelegram('🔔 Pesan tes dari Bimbingan Skripsi.');
  } catch (e) {
    q = 'error=' + encodeURIComponent((e as Error).message);
  }
  redirect(`/dosen/telegram?${q}`);
}

export async function putuskanTelegramAksi() {
  await wajibDosen();
  await putuskanTelegram();
  revalidatePath('/dosen/telegram');
}

export async function simpanChatTelegram(form: FormData) {
  await wajibDosen();
  const id = String(form.get('chatId') ?? '').trim();
  let q = 'ok=1';
  try {
    if (!/^-?\d{4,20}$/.test(id)) throw new Error('Chat ID harus berupa angka, mis. 123456789.');
    const chat = await simpanChatManual(id);
    await kirimTelegram(`✅ Notifikasi Bimbingan Skripsi aktif untuk <b>${esc(chat.nama)}</b>.`);
  } catch (e) {
    q = 'error=' + encodeURIComponent((e as Error).message);
  }
  revalidatePath('/dosen/telegram');
  redirect(`/dosen/telegram?${q}`);
}

export async function pilihGrupWa(chatId: string, nama: string | null, diizinkan: boolean) {
  await wajibDosen();
  await db()
    .insert(waGrup)
    .values({ chatId, nama, diizinkan })
    .onConflictDoUpdate({ target: waGrup.chatId, set: { diizinkan, ...(nama ? { nama } : {}) } });
  revalidatePath('/dosen/whatsapp');
}

export async function tambahGrupWaManual(form: FormData) {
  await wajibDosen();
  const id = String(form.get('chatId') ?? '').trim();
  if (!/^[\d-]{6,40}@g\.us$/.test(id)) redirect('/dosen/whatsapp?error=' + encodeURIComponent('ID grup harus berakhiran @g.us, mis. 120363012345678901@g.us.'));
  await pilihGrupWa(id, await namaGrup(id), true);
  redirect('/dosen/whatsapp?ok=grup');
}

export async function tesGrupWa() {
  await wajibDosen();
  let q = 'ok=tes';
  try {
    const hasil = await kirimKeGrup('🔔 Pesan tes dari aplikasi Bimbingan Skripsi. Hasil review berkas akan diumumkan di grup ini.');
    const gagal = hasil.filter((h) => !h.terkirim);
    if (gagal.length) q = 'error=' + encodeURIComponent(gagal.map((h) => `${h.grup}: ${h.error}`).join('; '));
  } catch (e) {
    q = 'error=' + encodeURIComponent((e as Error).message);
  }
  redirect(`/dosen/whatsapp?${q}`);
}

/** Jalankan review otomatis sekarang; prosesnya lanjut di latar, hasilnya dikirim ke Telegram. */
export async function mulaiReviewAi() {
  await wajibDosen();
  if (!reviewAiSiap()) redirect('/dosen/review-otomatis?error=' + encodeURIComponent('ANTHROPIC_API_KEY belum diatur di Vercel.'));
  waitUntil(jalankanReviewHarian().catch((e) => console.error('Review AI gagal', e)));
  redirect('/dosen/review-otomatis?mulai=1');
}
