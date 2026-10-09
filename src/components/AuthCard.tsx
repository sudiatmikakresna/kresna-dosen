import { IconBuku } from './icons';

export function AuthCard({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="d-flex align-items-center py-5" style={{ minHeight: '100vh' }}>
      <main className="container" style={{ maxWidth: 440 }}>
        <div className="text-center mb-4">
          <span className="d-inline-flex align-items-center justify-content-center bg-primary text-white mb-3" style={{ width: 48, height: 48 }}>
            <IconBuku size={24} />
          </span>
          <h1 className="h4 mb-0">Bimbingan Skripsi</h1>
        </div>
        <div className="card shadow-sm">
          <div className="card-body p-4">
            <h2 className="h5 card-title mb-1">{title}</h2>
            {subtitle && <p className="text-body-secondary small mb-4">{subtitle}</p>}
            {children}
          </div>
          {footer && <div className="card-footer text-center small py-3">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
