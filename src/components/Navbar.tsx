'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconBuku } from './icons';

type Item = { href: string; label: string; badge?: number; badgeClass?: string; exact?: boolean };

export function Navbar({ home, items, theme, tag, children }: {
  home: string; items: Item[]; theme: 'primary' | 'dark'; tag?: string; children?: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <nav className={`navbar navbar-expand bg-${theme}`} data-bs-theme="dark" aria-label="Menu utama">
      <div className="container flex-wrap gap-2">
        <Link className="navbar-brand d-flex align-items-center gap-2" href={home}>
          <IconBuku size={20} /> Bimbingan Skripsi
          {tag && <span className="badge text-bg-secondary fw-normal">{tag}</span>}
        </Link>
        <ul className="navbar-nav me-auto flex-wrap">
          {items.map((it) => {
            const active = it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`);
            return (
              <li className="nav-item" key={it.href}>
                <Link className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} href={it.href}>
                  {it.label}
                  {!!it.badge && <span className={`badge ms-1 ${it.badgeClass ?? 'text-bg-warning'}`}>{it.badge}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        {children}
      </div>
    </nav>
  );
}
