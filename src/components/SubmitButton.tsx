'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, className = 'btn btn-primary', pendingText, confirm }: {
  children: React.ReactNode; className?: string; pendingText?: string;
  /** Pertanyaan konfirmasi sebelum form dikirim, untuk aksi yang tidak bisa dibatalkan. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {pending ? (pendingText ?? 'Memproses…') : children}
    </button>
  );
}
