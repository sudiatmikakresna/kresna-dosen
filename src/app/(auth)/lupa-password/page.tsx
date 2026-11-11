import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';

export const metadata = { title: 'Lupa password' };

/** Atur ulang password mandiri ditutup: siapa pun yang tahu NIM bisa mengambil alih akun. Dosen mengatur ulang dari panel. */
export default function LupaPasswordPage() {
  return (
    <AuthCard title="Lupa password" footer={<><Link href="/masuk">Kembali ke halaman masuk</Link></>}>
      <p className="mb-0">Hubungi dosen pembimbing untuk mengatur ulang password. Dosen akan memberi password baru lewat panel dosen.</p>
    </AuthCard>
  );
}
