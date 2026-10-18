'use client';

import { useActionState } from 'react';
import { cobaTanyaBot, type CobaState } from '@/app/dosen/actions';

export function CobaTanya({ grup }: { grup: { chatId: string; nama: string }[] }) {
  const [state, action, pending] = useActionState<CobaState, FormData>(cobaTanyaBot, {});
  return (
    <form action={action}>
      <label htmlFor="coba" className="form-label small">Pertanyaan</label>
      <textarea id="coba" name="pertanyaan" rows={2} className="form-control form-control-sm mb-2" defaultValue={state.pertanyaan} required />
      <label htmlFor="coba-grup" className="form-label small">Sebagai grup (menentukan sumber dan kelas)</label>
      <select id="coba-grup" name="chatId" className="form-select form-select-sm mb-2">
        <option value="">Semua sumber, tanpa grup</option>
        {grup.map((g) => (
          <option key={g.chatId} value={g.chatId}>{g.nama}</option>
        ))}
      </select>
      <button className="btn btn-sm btn-primary" disabled={pending}>{pending ? 'Bertanya ke Claude…' : 'Tanya'}</button>
      {state.error && <div className="alert alert-danger small mt-3 mb-0">{state.error}</div>}
      {state.jawaban && (
        <div className="border rounded p-2 mt-3 small">
          <div className="mb-1">
            <span className={`badge ${state.status === 'dijawab' ? 'text-bg-success' : 'text-bg-warning'}`}>{state.status === 'dijawab' ? 'Dijawab' : 'Ditolak'}</span>
            {state.biaya != null && <span className="text-body-secondary ms-2">±${state.biaya.toFixed(4)}</span>}
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{state.jawaban}</div>
        </div>
      )}
    </form>
  );
}
