import { redirect } from 'next/navigation';
import { penggunaSaatIni } from '@/lib/auth';

export default async function Beranda() {
  const user = await penggunaSaatIni();
  if (user?.role === 'dosen') redirect('/dosen');
  if (user?.role === 'mahasiswa') redirect('/mahasiswa');
  redirect('/masuk');
}
