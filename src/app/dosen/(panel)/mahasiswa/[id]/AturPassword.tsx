'use client';

import { useActionState, useState } from 'react';
import { aturPasswordMahasiswa, type PasswordState } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';

export function AturPassword({ id, nama }: { id: number; nama: string }) {
  const [state, action] = useActionState<PasswordState, FormData>(aturPasswordMahasiswa.bind(null, id), undefined);
  const [lihat, setLihat] = useState(false);
  return (
    <form action={action} className="d-grid gap-2" style={{ maxWidth: 420 }}>
      {state?.error && <div className="alert alert-danger py-2 mb-0">{state.error}</div>}
      {state?.ok && <div className="alert alert-success py-2 mb-0">{state.ok}</div>}
      <div>
        <label htmlFor="password" className="form-label mb-1">Password baru</label>
        <div className="input-group input-group-sm">
          <input id="password" name="password" type={lihat ? 'text' : 'password'} autoComplete="new-password" className="form-control" placeholder="Minimal 8 karakter" required minLength={8} />
          <button type="button" className="btn btn-outline-secondary" onClick={() => setLihat(!lihat)} aria-label={lihat ? 'Sembunyikan password' : 'Tampilkan password'}>
            {lihat ? 'Sembunyikan' : 'Lihat'}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="password2" className="form-label mb-1">Konfirmasi password baru</label>
        <input id="password2" name="password2" type={lihat ? 'text' : 'password'} autoComplete="new-password" className="form-control form-control-sm" placeholder="Ketik ulang password" required />
      </div>
      <div>
        <SubmitButton className="btn btn-sm btn-primary" pendingText="Menyimpan…" confirm={`Ganti password ${nama}?`}>
          Simpan password baru
        </SubmitButton>
      </div>
    </form>
  );
}
