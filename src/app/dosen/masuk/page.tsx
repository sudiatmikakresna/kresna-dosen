import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { MasukDosenForm } from '@/app/(auth)/forms';
import { adaDosen } from '@/app/(auth)/actions';

export const metadata = { title: 'Masuk dosen' };
export const dynamic = 'force-dynamic';

export default async function MasukDosenPage() {
  const sudahAda = await adaDosen();
  return (
    <AuthCard
      title="Masuk dosen"
      footer={sudahAda ? <Link href="/masuk">Masuk sebagai mahasiswa</Link> : <>Belum ada akun dosen. <Link href="/dosen/setup">Buat akun dosen</Link></>}
    >
      <MasukDosenForm />
    </AuthCard>
  );
}
