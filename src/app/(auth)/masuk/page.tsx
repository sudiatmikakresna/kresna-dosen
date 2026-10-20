import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { MasukForm } from '../forms';

export const metadata = { title: 'Masuk' };

export default async function MasukPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <AuthCard
      title="Masuk mahasiswa"
      footer={<>Belum punya akun? <Link href="/daftar">Daftar dengan NIM</Link><br /><Link href="/dosen/masuk" className="d-inline-block mt-2">Masuk sebagai dosen</Link></>}
    >
      {reset && <div className="alert alert-success py-2 small">Password berhasil diganti. Silakan masuk dengan password baru.</div>}
      <MasukForm />
      <p className="small text-center mt-3 mb-0"><Link href="/lupa-password">Lupa password?</Link></p>
    </AuthCard>
  );
}
