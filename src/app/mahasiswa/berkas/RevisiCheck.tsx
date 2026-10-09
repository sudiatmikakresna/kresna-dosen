'use client';

import { useOptimistic, useTransition } from 'react';
import { ubahSelesai } from '../actions';

export function RevisiCheck({ id, selesai }: { id: number; selesai: boolean }) {
  const [pending, start] = useTransition();
  const [nilai, setNilai] = useOptimistic(selesai);
  return (
    <div className="form-check">
      <input
        className="form-check-input"
        type="checkbox"
        id={`rev${id}`}
        checked={nilai}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.checked;
          start(async () => {
            setNilai(v);
            await ubahSelesai(id, v);
          });
        }}
      />
      <label className="form-check-label small" htmlFor={`rev${id}`}>Sudah saya perbaiki</label>
    </div>
  );
}
