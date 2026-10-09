import { keluar } from '@/app/(auth)/actions';
import { Navbar } from '@/components/Navbar';
import { wajibMahasiswa } from '@/lib/auth';
import { revisiTerbukaMahasiswa } from '@/lib/service';

export const dynamic = 'force-dynamic';

export default async function MahasiswaLayout({ children }: { children: React.ReactNode }) {
  const user = await wajibMahasiswa();
  const terbuka = await revisiTerbukaMahasiswa(user.id);
  return (
    <>
      <Navbar
        home="/mahasiswa"
        theme="primary"
        items={[
          { href: '/mahasiswa', label: 'Dashboard', exact: true },
          { href: '/mahasiswa/upload', label: 'Upload Berkas' },
          { href: '/mahasiswa/berkas', label: 'Berkas & Revisi', badge: terbuka },
        ]}
      >
        <div className="d-flex align-items-center gap-3 text-white small">
          <span>{user.nama} · <span className="font-monospace">{user.nim}</span></span>
          <form action={keluar}><button className="btn btn-sm btn-outline-light">Keluar</button></form>
        </div>
      </Navbar>
      <main className="container py-4">{children}</main>
    </>
  );
}
