import { keluar } from '@/app/(auth)/actions';
import { Navbar } from '@/components/Navbar';
import { wajibDosen } from '@/lib/auth';
import { antrianReview } from '@/lib/service';
import { akunDrive } from '@/lib/google';

export const dynamic = 'force-dynamic';

export default async function DosenLayout({ children }: { children: React.ReactNode }) {
  const dosen = await wajibDosen();
  const [antrian, drive] = await Promise.all([antrianReview(), akunDrive()]);
  return (
    <>
      <Navbar
        home="/dosen"
        theme="dark"
        tag="Dosen"
        items={[
          { href: '/dosen', label: 'Mahasiswa', exact: true },
          { href: '/dosen/antrian', label: 'Antrian Review', badge: antrian.length },
          { href: '/dosen/drive', label: 'Google Drive', badge: drive ? 0 : 1, badgeClass: 'text-bg-danger' },
          { href: '/dosen/telegram', label: 'Telegram' },
          { href: '/dosen/mcp', label: 'Koneksi MCP' },
        ]}
      >
        <div className="d-flex align-items-center gap-3 small">
          <span className="navbar-text">{dosen.nama}</span>
          <form action={keluar}><button className="btn btn-sm btn-outline-light">Keluar</button></form>
        </div>
      </Navbar>
      <main className="container py-4">{children}</main>
    </>
  );
}
