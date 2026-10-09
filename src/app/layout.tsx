import type { Metadata } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';
import './theme.css';

export const metadata: Metadata = {
  title: { default: 'Bimbingan Skripsi', template: '%s · Bimbingan Skripsi' },
  description: 'Sistem bimbingan skripsi: unggah berkas, revisi dosen, dan riwayat bimbingan.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-body-tertiary">{children}</body>
    </html>
  );
}
