import { status } from '@/lib/labels';

export function StatusBadge({ s, className = '' }: { s: string; className?: string }) {
  const st = status(s);
  return <span className={`badge ${st.badge} ${className}`}>{st.label}</span>;
}
