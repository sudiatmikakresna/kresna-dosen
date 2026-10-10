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
import { KUNCI_AKTIF, KUNCI_PENGETAHUAN, MAKS_PENGETAHUAN, simpanPengaturan } from '@/lib/wa-bot';
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

export async function izinkanGrupWa(chatId: string, diizinkan: boolean) {
  await wajibDosen();
  await db().update(waGrup).set({ diizinkan }).where(eq(waGrup.chatId, chatId));
  revalidatePath('/dosen/whatsapp');
}

export async function hapusGrupWa(chatId: string) {
  await wajibDosen();
  await db().delete(waGrup).where(eq(waGrup.chatId, chatId));
  revalidatePath('/dosen/whatsapp');
}

export async function aturBotWa(aktif: boolean) {
  await wajibDosen();
  await simpanPengaturan(KUNCI_AKTIF, aktif ? '1' : '0');
  revalidatePath('/dosen/whatsapp');
}

export async function simpanPengetahuanWa(form: FormData) {
  await wajibDosen();
  const teks = String(form.get('pengetahuan') ?? '').slice(0, MAKS_PENGETAHUAN);
  await simpanPengaturan(KUNCI_PENGETAHUAN, teks);
  revalidatePath('/dosen/whatsapp');
  redirect('/dosen/whatsapp?disimpan=1');
}
