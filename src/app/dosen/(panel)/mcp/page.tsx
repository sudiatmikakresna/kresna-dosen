import { and, desc, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db, mcpTokens, oauthToken } from '@/db';
import { wajibDosen } from '@/lib/auth';
import { waktu } from '@/lib/labels';
import { cabutKoneksiOauth, cabutToken } from '@/app/dosen/actions';
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
  ['kirim_laporan_whatsapp', 'Mengumumkan hasil review ke grup WhatsApp tujuan'],
];

const TOOLS_WAHA: [string, string][] = [
  ['status_whatsapp', 'Status sesi WhatsApp dan nomor yang tertaut'],
  ['daftar_chat', 'Chat terbaru beserta pesan terakhirnya'],
  ['daftar_grup', 'Grup yang diikuti, ditandai grup tujuan laporan'],
  ['baca_pesan', 'Pesan terakhir di satu chat (langsung dari WAHA)'],
  ['riwayat_grup_tersimpan', 'Riwayat grup bimbingan dari database'],
  ['cek_nomor', 'Cek nomor terdaftar di WhatsApp'],
  ['kirim_pesan', 'Kirim pesan teks ke chat pribadi atau grup'],
  ['tandai_dibaca', 'Tandai chat sudah dibaca'],
];

const TOOLS_SISKA: [string, string][] = [
  ['daftar_kelas', 'Kelas yang diampu pada periode berjalan'],
  ['jadwal_mengajar', 'Pertemuan pada satu tanggal beserta statusnya'],
  ['detail_kelas', 'Semua pertemuan satu kelas'],
  ['lihat_presensi', 'Peserta, status, dan rekap presensi satu pertemuan'],
  ['mulai_pertemuan', 'Memulai pertemuan yang masih terjadwal'],
  ['ubah_presensi', 'Mengisi Hadir/Sakit/Izin/Alfa untuk mahasiswa tertentu'],
  ['tutup_presensi', 'Mengisi Alfa untuk mahasiswa yang belum punya status'],
];

export default async function McpPage() {
  const dosen = await wajibDosen();
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const mcpUrl = `${proto}://${host}/api/mcp`;
  const wahaUrl = `${proto}://${host}/api/waha/mcp`;
  const siskaUrl = `${proto}://${host}/api/siska/mcp`;
  const tokens = await db().select().from(mcpTokens).where(eq(mcpTokens.dosenId, dosen.id)).orderBy(desc(mcpTokens.createdAt));
  const koneksi = await db()
    .select()
    .from(oauthToken)
    .where(and(eq(oauthToken.dosenId, dosen.id), isNull(oauthToken.revokedAt)))
    .orderBy(desc(oauthToken.createdAt));

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
          <div className="card mb-4">
            <div className="card-header fw-semibold">Connector Claude chat (claude.ai, Desktop, mobile)</div>
            <div className="card-body small">
              <p className="mb-2">
                Di Claude: <strong>Customize → Connectors → Add → Custom → Web</strong>, isi nama dan URL berikut, lalu <strong>Connect</strong>.
                Claude membuka halaman login aplikasi ini; masuk sebagai dosen dan klik <strong>Izinkan</strong>. Tidak perlu token.
              </p>
              <dl className="row mb-0">
                <dt className="col-sm-4">WhatsApp (WAHA)</dt>
                <dd className="col-sm-8"><code className="user-select-all">{wahaUrl}</code></dd>
                <dt className="col-sm-4">Bimbingan Skripsi</dt>
                <dd className="col-sm-8"><code className="user-select-all">{mcpUrl}</code></dd>
                <dt className="col-sm-4">SISKA (presensi kuliah)</dt>
                <dd className="col-sm-8 mb-0"><code className="user-select-all">{siskaUrl}</code></dd>
              </dl>
            </div>
            <div className="table-responsive border-top">
              <table className="table align-middle mb-0">
                <thead className="table-light"><tr><th>Koneksi aktif</th><th>Server</th><th>Dipakai terakhir</th><th /></tr></thead>
                <tbody>
                  {koneksi.map((k) => (
                    <tr key={k.id}>
                      <td>{k.namaKlien ?? 'Klien MCP'}<div className="small text-body-secondary">sejak {waktu(k.createdAt)}</div></td>
                      <td className="small">{k.resource?.endsWith('/api/waha/mcp') ? 'WhatsApp' : k.resource?.endsWith('/api/siska/mcp') ? 'SISKA' : k.resource?.endsWith('/api/mcp') ? 'Bimbingan' : 'Semua'}</td>
                      <td className="small">{waktu(k.lastUsedAt)}</td>
                      <td className="text-end">
                        <form action={cabutKoneksiOauth.bind(null, k.id)}><button className="btn btn-sm btn-outline-danger">Cabut</button></form>
                      </td>
                    </tr>
                  ))}
                  {!koneksi.length && <tr><td colSpan={4} className="text-body-secondary small">Belum ada connector yang terhubung.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-header fw-semibold">Token aktif (Claude Code / klien dengan header)</div>
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
          <div className="card mt-4">
            <div className="card-header fw-semibold">Tool WhatsApp (<code>/api/waha/mcp</code>)</div>
            <ul className="list-group list-group-flush small">
              {TOOLS_WAHA.map(([n, d]) => (
                <li key={n} className="list-group-item"><code>{n}</code><div className="text-body-secondary">{d}</div></li>
              ))}
            </ul>
            <div className="card-footer small text-body-secondary">
              <code>kirim_pesan</code> mengirim atas nama nomor Anda. Atur di Claude agar tool ini selalu meminta persetujuan.
            </div>
          </div>
          <div className="card mt-4">
            <div className="card-header fw-semibold">Tool SISKA (<code>/api/siska/mcp</code>)</div>
            <ul className="list-group list-group-flush small">
              {TOOLS_SISKA.map(([n, d]) => (
                <li key={n} className="list-group-item"><code>{n}</code><div className="text-body-secondary">{d}</div></li>
              ))}
            </ul>
            <div className="card-footer small text-body-secondary">
              Memakai <code>SISKA_COOKIE</code> akun dosen. Tool yang mengubah presensi berjalan atas nama Anda di SISKA.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
