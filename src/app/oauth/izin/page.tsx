import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/AuthCard';
import { SubmitButton } from '@/components/SubmitButton';
import { penggunaSaatIni } from '@/lib/auth';
import { origin, RESOURCE } from '@/lib/oauth';
import { putuskanIzin } from './actions';
import { validasi, type Permintaan } from './validasi';

export const metadata = { title: 'Izinkan akses connector' };
export const dynamic = 'force-dynamic';

const KEMAMPUAN = {
  waha: 'Membaca status, daftar chat, dan pesan WhatsApp di nomor yang tertaut ke WAHA, serta mengirim pesan teks atas nama nomor itu.',
  bimbingan: 'Membaca mahasiswa dan berkas bimbingan, menulis draf catatan revisi, dan mengirim keputusan revisi.',
  siska: 'Membaca kelas, jadwal, dan presensi kuliah di SISKA dengan akun dosen, serta memulai pertemuan dan mengubah atau menutup presensi.',
};

export default async function IzinPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = (await searchParams) as Permintaan;
  const v = await validasi(p, origin());
  if (v.jenis === 'redirect') redirect(v.url);
  if (v.jenis === 'halaman') {
    return (
      <AuthCard title="Permintaan akses tidak valid">
        <div className="alert alert-danger mb-0">{v.pesan}</div>
      </AuthCard>
    );
  }

  const user = await penggunaSaatIni();
  if (!user || user.role !== 'dosen') {
    const kembali = '/oauth/izin?' + new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();
    redirect('/dosen/masuk?next=' + encodeURIComponent(kembali));
  }

  const host = new URL(v.redirectUri).host;
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return (
    <AuthCard title="Izinkan akses connector">
      <p className="mb-2">
        <strong>{v.klien.nama}</strong> meminta akses ke akun dosen <strong>{user.nama}</strong>:
      </p>
      <ul className="small mb-3">
        {v.jenisResource.map((r) => (
          <li key={r}>
            <strong>{RESOURCE[r].nama}</strong>: {KEMAMPUAN[r]}
          </li>
        ))}
      </ul>
      <p className="small text-body-secondary mb-3">
        Setelah diizinkan, Anda akan diarahkan ke <code>{host}</code>.
        {loopback && <> Ini alamat lokal (Claude Code di komputer ini); izinkan hanya bila Anda sendiri yang memulai koneksi.</>} Akses bisa dicabut
        kapan saja di Panel dosen → Koneksi MCP.
      </p>
      <form action={putuskanIzin} className="d-flex gap-2">
        {Object.entries(p).map(([k, val]) => (val ? <input key={k} type="hidden" name={k} value={val} /> : null))}
        <input type="hidden" name="keputusan" value="izinkan" />
        <SubmitButton className="btn btn-primary flex-grow-1" pendingText="Mengizinkan…">
          Izinkan
        </SubmitButton>
      </form>
      <form action={putuskanIzin} className="mt-2">
        {Object.entries(p).map(([k, val]) => (val ? <input key={k} type="hidden" name={k} value={val} /> : null))}
        <input type="hidden" name="keputusan" value="tolak" />
        <button className="btn btn-link w-100 text-body-secondary">Tolak</button>
      </form>
    </AuthCard>
  );
}
