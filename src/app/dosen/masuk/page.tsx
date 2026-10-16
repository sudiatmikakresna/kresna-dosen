import Link from 'next/link';
import { redirect } from 'next/navigation';
import { penggunaSaatIni } from '@/lib/auth';
import { AuthCard } from '@/components/AuthCard';
import { MasukDosenForm } from '@/app/(auth)/forms';
import { adaDosen } from '@/app/(auth)/actions';

export const metadata = { title: 'Masuk dosen' };
export const dynamic = 'force-dynamic';

export default async function MasukDosenPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const sudahAda = await adaDosen();
  // Sudah login sebagai dosen dan datang dari layar persetujuan connector: langsung kembali ke sana.
  if (next?.startsWith('/oauth/izin?')) {
    const user = await penggunaSaatIni();
    if (user?.role === 'dosen') redirect(next);
  }
  return (
    <AuthCard
      title="Masuk dosen"
      subtitle={next?.startsWith('/oauth/izin?') ? 'Masuk untuk mengizinkan connector Claude.' : undefined}
      footer={sudahAda ? <Link href="/masuk">Masuk sebagai mahasiswa</Link> : <>Belum ada akun dosen. <Link href="/dosen/setup">Buat akun dosen</Link></>}
    >
      <MasukDosenForm next={next?.startsWith('/oauth/izin?') ? next : undefined} />
    </AuthCard>
  );
}
