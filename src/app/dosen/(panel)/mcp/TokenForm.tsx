'use client';

import { useActionState } from 'react';
import { buatTokenMcp } from '@/app/dosen/actions';
import { SubmitButton } from '@/components/SubmitButton';

export function TokenForm({ mcpUrl }: { mcpUrl: string }) {
  const [state, action] = useActionState(buatTokenMcp, undefined);
  return (
    <>
      <form action={action} className="d-flex flex-wrap gap-2 mb-3">
        <label htmlFor="nama" className="visually-hidden">Nama token</label>
        <input id="nama" name="nama" className="form-control" style={{ maxWidth: 280 }} placeholder="cth. Claude Code laptop" />
        <SubmitButton>Buat token baru</SubmitButton>
      </form>
      {state?.token && (
        <div className="alert alert-warning" role="status">
          <div className="fw-semibold mb-1">Salin token ini sekarang. Token tidak akan ditampilkan lagi.</div>
          <code className="d-block user-select-all mb-2 text-break">{state.token}</code>
          <div className="small mb-1">Perintah untuk Claude Code:</div>
          <code className="d-block user-select-all small text-break">
            claude mcp add --transport http bimbingan {mcpUrl} --header &quot;Authorization: Bearer {state.token}&quot;
          </code>
        </div>
      )}
    </>
  );
}
