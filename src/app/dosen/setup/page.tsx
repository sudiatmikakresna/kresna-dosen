import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { SetupDosenForm } from '@/app/(auth)/forms';
import { adaDosen } from '@/app/(auth)/actions';

export const metadata = { title: 'Setup dosen' };
export const dynamic = 'force-dynamic';

export default async function SetupDosenPage() {
  if (await adaDosen()) {
    return (
      <AuthCard title="Akun dosen sudah ada" footer={<Link href="/dosen/masuk">Masuk dosen</Link>}>
        <p className="mb-0">Akun dosen hanya bisa dibuat sekali.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Buat akun dosen" subtitle="Dilakukan sekali saat sistem pertama kali dipasang.">
      <SetupDosenForm />
    </AuthCard>
  );
}
