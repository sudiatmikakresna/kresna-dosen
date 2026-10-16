'use server';

import { redirect } from 'next/navigation';
import { penggunaSaatIni } from '@/lib/auth';
import { buatKode, origin, RESOURCE, SCOPE } from '@/lib/oauth';
import { ipPeminta, peringatan } from '@/lib/keamanan';
import { esc } from '@/lib/telegram';
import { urlKembali, validasi, type Permintaan } from './validasi';

const KUNCI = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as const;

/** Keputusan dosen di layar persetujuan: buat kode otorisasi atau kembalikan access_denied ke Claude. */
export async function putuskanIzin(form: FormData) {
  const p: Permintaan = Object.fromEntries(KUNCI.map((k) => [k, (form.get(k) as string | null) || undefined]));
  const iss = origin();
  const user = await penggunaSaatIni();
  if (!user || user.role !== 'dosen') redirect('/dosen/masuk');
  const v = await validasi(p, iss);
  if (v.jenis === 'halaman') throw new Error(v.pesan);
  if (v.jenis === 'redirect') redirect(v.url);
  if (form.get('keputusan') !== 'izinkan') {
    redirect(urlKembali(v.redirectUri, { error: 'access_denied', error_description: 'Akses ditolak dosen.', state: p.state, iss }));
  }
  const code = await buatKode({
    clientId: v.klien.clientId,
    dosenId: user.id,
    redirectUri: v.redirectUri,
    codeChallenge: p.code_challenge!,
    scope: p.scope?.trim() || SCOPE,
    resource: v.resource,
  });
  await peringatan(
    `🔐 <b>Connector baru diizinkan</b>: ${esc(v.klien.nama)} → ${esc(v.jenisResource.map((r) => RESOURCE[r].nama).join(', '))}\n` +
      `IP <code>${esc(await ipPeminta())}</code>. Bukan Anda? Cabut di Panel dosen → Koneksi MCP lalu ganti password.`,
  );
  redirect(urlKembali(v.redirectUri, { code, state: p.state, iss }));
}
