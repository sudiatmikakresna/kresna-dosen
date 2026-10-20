import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { LupaPasswordForm } from '../forms';

export const metadata = { title: 'Lupa password' };

export default function LupaPasswordPage() {
  return (
    <AuthCard title="Lupa password" footer={<><Link href="/masuk">Kembali ke halaman masuk</Link></>}>
      <p className="small text-body-secondary">Isi NIM dan password baru Anda. Setelah disimpan, masuk lagi dengan password baru.</p>
      <LupaPasswordForm />
    </AuthCard>
  );
}
