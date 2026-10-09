import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { DaftarForm } from '../forms';

export const metadata = { title: 'Daftar' };

export default function DaftarPage() {
  return (
    <AuthCard
      title="Daftar akun mahasiswa"
      subtitle="Gunakan NIM agar dosen pembimbing dapat menelusuri riwayat bimbingan Anda."
      footer={<>Sudah punya akun? <Link href="/masuk">Masuk dengan NIM</Link></>}
    >
      <DaftarForm />
    </AuthCard>
  );
}
