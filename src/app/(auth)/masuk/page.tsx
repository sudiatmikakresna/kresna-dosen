import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { MasukForm } from '../forms';

export const metadata = { title: 'Masuk' };

export default function MasukPage() {
  return (
    <AuthCard
      title="Masuk mahasiswa"
      footer={<>Belum punya akun? <Link href="/daftar">Daftar dengan NIM</Link><br /><Link href="/dosen/masuk" className="d-inline-block mt-2">Masuk sebagai dosen</Link></>}
    >
      <MasukForm />
      <p className="small text-body-secondary text-center mt-3 mb-0">Lupa password? Hubungi dosen pembimbing untuk mengatur ulang.</p>
    </AuthCard>
  );
}
