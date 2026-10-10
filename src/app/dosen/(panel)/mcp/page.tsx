import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db, mcpTokens } from '@/db';
import { wajibDosen } from '@/lib/auth';
import { waktu } from '@/lib/labels';
import { cabutToken } from '@/app/dosen/actions';
import { TokenForm } from './TokenForm';

export const metadata = { title: 'Koneksi MCP' };

const TOOLS: [string, string][] = [
  ['daftar_mahasiswa', 'Daftar mahasiswa bimbingan beserta kemajuan dan status berkas terakhir'],
  ['antrian_review', 'Berkas yang menunggu review, dari yang paling lama'],
  ['baca_berkas', 'Metadata dan isi teks satu berkas, plus revisi versi sebelumnya'],
  ['riwayat_mahasiswa', 'Semua berkas dan riwayat bimbingan satu mahasiswa'],
  ['tambah_revisi', 'Menambah satu atau beberapa catatan revisi sebagai draf'],
  ['ubah_revisi', 'Mengubah teks/lokasi/jenis catatan, atau membuangnya'],
  ['set_ringkasan', 'Mengisi ringkasan untuk mahasiswa'],
  ['kirim_revisi', 'Mengirim draf ke mahasiswa dengan keputusan perlu revisi atau disetujui'],
  ['kirim_laporan_telegram', 'Mengirim laporan teks ke Telegram dosen, mis. ringkasan review harian'],
];

export default async function McpPage() {
  const dosen = await wajibDosen();
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const mcpUrl = `${proto}://${host}/api/mcp`;
  const tokens = await db().select().from(mcpTokens).where(eq(mcpTokens.dosenId, dosen.id)).orderBy(desc(mcpTokens.createdAt));

  return (
    <>
      <h1 className="h3 mb-1">Koneksi MCP</h1>
      <p className="text-body-secondary small mb-4">
        Hubungkan Claude (atau klien MCP lain) supaya agent bisa membaca berkas dan menambahkan catatan revisi sebagai draf.
      </p>
      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card mb-4">
            <div className="card-header fw-semibold">Alamat server</div>
            <div className="card-body">
              <code className="d-block user-select-all mb-3">{mcpUrl}</code>
              <TokenForm mcpUrl={mcpUrl} />
              <p className="small text-body-secondary mb-0">
                Token dikirim sebagai header <code>Authorization: Bearer …</code>. Simpan seperti password; cabut jika bocor.
              </p>
            </div>
          </div>
          <div className="card">
            <div className="card-header fw-semibold">Token aktif</div>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead className="table-light"><tr><th>Nama</th><th>Awalan</th><th>Dipakai terakhir</th><th /></tr></thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.id} className={t.revokedAt ? 'text-body-secondary' : ''}>
                      <td>{t.nama}</td>
                      <td className="font-monospace small">{t.prefix}…</td>
                      <td className="small">{t.revokedAt ? `Dicabut ${waktu(t.revokedAt)}` : waktu(t.lastUsedAt)}</td>
                      <td className="text-end">
                        {!t.revokedAt && (
                          <form action={cabutToken.bind(null, t.id)}><button className="btn btn-sm btn-outline-danger">Cabut</button></form>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!tokens.length && <tr><td colSpan={4} className="text-body-secondary small">Belum ada token.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card">
            <div className="card-header fw-semibold">Tool yang tersedia</div>
            <ul className="list-group list-group-flush small">
              {TOOLS.map(([n, d]) => (
                <li key={n} className="list-group-item"><code>{n}</code><div className="text-body-secondary">{d}</div></li>
              ))}
            </ul>
            <div className="card-footer small text-body-secondary">
              Catatan dari MCP masuk sebagai <strong>draf</strong> dan baru terlihat mahasiswa setelah dikirim.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
