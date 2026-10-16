'use client';

import { useActionState, useState } from 'react';
import { daftar, masuk, masukDosen, setupDosen, type FormState } from './actions';
import { SubmitButton } from '@/components/SubmitButton';

function Galat({ state }: { state: FormState }) {
  return state?.error ? <div className="alert alert-danger py-2 small" role="alert">{state.error}</div> : null;
}

function PasswordField({ id, label, autoComplete, placeholder, show, onToggle }: {
  id: string; label: string; autoComplete: string; placeholder?: string; show: boolean; onToggle?: () => void;
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">{label}</label>
      <div className="input-group">
        <input id={id} name={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} className="form-control" placeholder={placeholder} required />
        {onToggle && (
          <button type="button" className="btn btn-outline-secondary" onClick={onToggle} aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}>
            {show ? 'Sembunyikan' : 'Lihat'}
          </button>
        )}
      </div>
    </div>
  );
}

export function DaftarForm() {
  const [state, action] = useActionState(daftar, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action}>
      <Galat state={state} />
      <div className="mb-3">
        <label htmlFor="nim" className="form-label">NIM</label>
        <input id="nim" name="nim" inputMode="numeric" autoComplete="username" className="form-control font-monospace" placeholder="cth. 2105551023" required />
        <div className="form-text">Sesuai yang tertera di kartu mahasiswa.</div>
      </div>
      <div className="mb-3">
        <label htmlFor="nama" className="form-label">Nama lengkap</label>
        <input id="nama" name="nama" autoComplete="name" className="form-control" placeholder="Nama sesuai data akademik" required />
      </div>
      <PasswordField id="password" label="Password" autoComplete="new-password" placeholder="Minimal 8 karakter" show={show} onToggle={() => setShow(!show)} />
      <PasswordField id="password2" label="Ulangi password" autoComplete="new-password" placeholder="Ketik ulang password" show={show} />
      <SubmitButton className="btn btn-primary w-100 py-2 mt-2">Daftar</SubmitButton>
    </form>
  );
}

export function MasukForm() {
  const [state, action] = useActionState(masuk, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action}>
      <Galat state={state} />
      <div className="mb-3">
        <label htmlFor="nim" className="form-label">NIM</label>
        <input id="nim" name="nim" inputMode="numeric" autoComplete="username" className="form-control font-monospace" required />
      </div>
      <PasswordField id="password" label="Password" autoComplete="current-password" show={show} onToggle={() => setShow(!show)} />
      <SubmitButton className="btn btn-primary w-100 py-2 mt-2">Masuk</SubmitButton>
    </form>
  );
}

export function MasukDosenForm({ next }: { next?: string }) {
  const [state, action] = useActionState(masukDosen, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action}>
      <Galat state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <div className="mb-3">
        <label htmlFor="username" className="form-label">Username</label>
        <input id="username" name="username" autoComplete="username" className="form-control" required />
      </div>
      <PasswordField id="password" label="Password" autoComplete="current-password" show={show} onToggle={() => setShow(!show)} />
      <SubmitButton className="btn btn-primary w-100 py-2 mt-2">Masuk</SubmitButton>
    </form>
  );
}

export function SetupDosenForm() {
  const [state, action] = useActionState(setupDosen, undefined);
  return (
    <form action={action}>
      <Galat state={state} />
      <div className="mb-3">
        <label htmlFor="kunci" className="form-label">Kunci setup</label>
        <input id="kunci" name="kunci" type="password" className="form-control" required />
        <div className="form-text">Nilai variabel lingkungan <code>SETUP_KEY</code> di Vercel.</div>
      </div>
      <div className="mb-3">
        <label htmlFor="nama" className="form-label">Nama dosen</label>
        <input id="nama" name="nama" className="form-control" required />
      </div>
      <div className="mb-3">
        <label htmlFor="username" className="form-label">Username</label>
        <input id="username" name="username" autoComplete="username" className="form-control" required />
      </div>
      <div className="mb-3">
        <label htmlFor="password" className="form-label">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" className="form-control" required />
        <div className="form-text">Minimal 10 karakter.</div>
      </div>
      <SubmitButton className="btn btn-primary w-100 py-2 mt-2">Buat akun dosen</SubmitButton>
    </form>
  );
}
