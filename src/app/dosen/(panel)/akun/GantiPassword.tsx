'use client';

import { useActionState, useState } from 'react';
import { gantiPasswordDosen, type PasswordState } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';

export function GantiPassword() {
  const [state, action] = useActionState<PasswordState, FormData>(gantiPasswordDosen, undefined);
  const [lihat, setLihat] = useState(false);
  const tipe = lihat ? 'text' : 'password';
  return (
    <form action={action} className="d-grid gap-3">
      {state?.error && <div className="alert alert-danger py-2 mb-0">{state.error}</div>}
      <div>
        <label htmlFor="lama" className="form-label mb-1">Password lama</label>
        <input id="lama" name="lama" type={tipe} autoComplete="current-password" className="form-control" required />
      </div>
      <div>
        <label htmlFor="password" className="form-label mb-1">Password baru</label>
        <input id="password" name="password" type={tipe} autoComplete="new-password" className="form-control" placeholder="Minimal 12 karakter" required minLength={12} />
      </div>
      <div>
        <label htmlFor="password2" className="form-label mb-1">Konfirmasi password baru</label>
        <input id="password2" name="password2" type={tipe} autoComplete="new-password" className="form-control" required />
      </div>
      <div className="d-flex gap-2">
        <SubmitButton className="btn btn-primary" pendingText="Menyimpan…">Ganti password</SubmitButton>
        <button type="button" className="btn btn-outline-secondary" onClick={() => setLihat(!lihat)}>{lihat ? 'Sembunyikan' : 'Lihat'}</button>
      </div>
    </form>
  );
}
