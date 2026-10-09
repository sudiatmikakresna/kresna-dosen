import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, users } from '@/db';
import { labelJenis, TAHAP } from '@/lib/labels';
import { verifikasiToken } from '@/lib/mcp-token';
import {
  aktivitasMahasiswa,
  antrianReview,
  berkasMahasiswa,
  daftarMahasiswa,
  detailBerkas,
  kirimRevisi,
  setRingkasan,
  tambahRevisi,
  ubahRevisi,
  versiSebelumnya,
} from '@/lib/service';

export const maxDuration = 60;

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const gagal = (pesan: string) => ({ content: [{ type: 'text' as const, text: pesan }], isError: true });

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'daftar_mahasiswa',
      {
        title: 'Daftar mahasiswa bimbingan',
        description: 'Daftar semua mahasiswa bimbingan dengan kemajuan per tahap, berkas terakhir, dan aktivitas terakhir.',
        inputSchema: {},
      },
      async () => {
        const rows = await daftarMahasiswa();
        return json(
          rows.map((m) => ({
            mahasiswa_id: m.id,
            nama: m.nama,
            nim: m.nim,
            judul_skripsi: m.judulSkripsi,
            tahap_disetujui: `${m.tahapSelesai}/${TAHAP.length}`,
            tahap: m.tahap,
            berkas_terakhir: m.berkasTerakhir && {
              berkas_id: m.berkasTerakhir.id,
              jenis: labelJenis(m.berkasTerakhir.jenis),
              versi: m.berkasTerakhir.versi,
              status: m.berkasTerakhir.status,
            },
            aktif_terakhir: m.aktifTerakhir,
            tidak_aktif_14_hari: m.tidakAktif,
          })),
        );
      },
    );

    server.registerTool(
      'antrian_review',
      {
        title: 'Antrian review',
        description: 'Berkas yang belum dikirim keputusannya (status menunggu atau draf), urut dari yang paling lama.',
        inputSchema: {},
      },
      async () => {
        const rows = await antrianReview();
        return json(rows.map((r) => ({ berkas_id: r.id, mahasiswa: r.nama, nim: r.nim, jenis: labelJenis(r.jenis), versi: r.versi, status: r.status, dikirim: r.createdAt })));
      },
    );

    server.registerTool(
      'baca_berkas',
      {
        title: 'Baca berkas',
        description:
          'Ambil metadata dan isi teks berkas (per halaman untuk PDF), catatan dari mahasiswa, catatan revisi yang sudah ada, dan revisi pada versi sebelumnya. Gunakan sebelum menulis revisi.',
        inputSchema: {
          berkas_id: z.number().int().describe('ID berkas'),
          maks_karakter: z.number().int().min(1000).max(400000).optional().describe('Batas panjang teks (bawaan 120000)'),
        },
      },
      async ({ berkas_id, maks_karakter }) => {
        const d = await detailBerkas(berkas_id);
        if (!d) return gagal(`Berkas ${berkas_id} tidak ditemukan.`);
        const batas = maks_karakter ?? 120_000;
        const teks = d.berkas.teks ?? null;
        const lama = await versiSebelumnya(d.berkas);
        return json({
          berkas_id: d.berkas.id,
          mahasiswa: { mahasiswa_id: d.mahasiswa.id, nama: d.mahasiswa.nama, nim: d.mahasiswa.nim, judul_skripsi: d.mahasiswa.judulSkripsi },
          jenis: labelJenis(d.berkas.jenis),
          versi: d.berkas.versi,
          status: d.berkas.status,
          sumber: d.berkas.sumber,
          url_berkas: d.berkas.fileUrl,
          url_google_docs: d.berkas.gdocsUrl,
          catatan_mahasiswa: d.berkas.catatan,
          ringkasan: d.berkas.ringkasan,
          revisi_saat_ini: d.revisi.map((r) => ({ revisi_id: r.id, lokasi: r.lokasi, jenis: r.jenis, teks: r.teks, status: r.status, sumber: r.sumber })),
          revisi_versi_sebelumnya: lama.map((l) => ({
            versi: l.versi,
            revisi: l.revisi.map((r) => ({ lokasi: r.lokasi, jenis: r.jenis, teks: r.teks, ditandai_selesai_mahasiswa: r.selesai })),
          })),
          teks: teks ? teks.slice(0, batas) : 'Teks berkas tidak tersedia (gagal diekstrak). Buka url_berkas untuk membaca.',
          teks_terpotong: !!teks && teks.length > batas,
        });
      },
    );

    server.registerTool(
      'riwayat_mahasiswa',
      {
        title: 'Riwayat mahasiswa',
        description: 'Semua berkas (semua versi) dan riwayat aktivitas bimbingan satu mahasiswa.',
        inputSchema: { mahasiswa_id: z.number().int() },
      },
      async ({ mahasiswa_id }) => {
        const [m] = await db().select().from(users).where(eq(users.id, mahasiswa_id)).limit(1);
        if (!m || m.role !== 'mahasiswa') return gagal(`Mahasiswa ${mahasiswa_id} tidak ditemukan.`);
        const [daftar, log] = await Promise.all([berkasMahasiswa(m.id), aktivitasMahasiswa(m.id, 50)]);
        return json({
          nama: m.nama,
          nim: m.nim,
          judul_skripsi: m.judulSkripsi,
          berkas: daftar.map((b) => ({ berkas_id: b.id, jenis: labelJenis(b.jenis), versi: b.versi, status: b.status, dikirim: b.createdAt })),
          aktivitas: log.map((a) => ({ waktu: a.createdAt, teks: a.teks })),
        });
      },
    );

    server.registerTool(
      'tambah_revisi',
      {
        title: 'Tambah catatan revisi',
        description:
          'Menambahkan satu atau beberapa catatan revisi ke sebuah berkas sebagai DRAF. Mahasiswa belum melihatnya sampai kirim_revisi dipanggil atau dosen menekan Kirim di web.',
        inputSchema: {
          berkas_id: z.number().int(),
          catatan: z
            .array(
              z.object({
                lokasi: z.string().max(200).optional().describe('cth. "Hal. 12 · 2.1 Landasan Teori"'),
                jenis: z.enum(['wajib', 'saran']).optional().describe('wajib (bawaan) atau saran'),
                teks: z.string().min(3).max(4000),
              }),
            )
            .min(1)
            .max(50),
        },
      },
      async ({ berkas_id, catatan }) => {
        try {
          const baru = await tambahRevisi(berkas_id, catatan, 'mcp');
          return json({ ditambahkan: baru.map((r) => ({ revisi_id: r.id, lokasi: r.lokasi, jenis: r.jenis })), status: 'draf' });
        } catch (e) {
          return gagal((e as Error).message);
        }
      },
    );

    server.registerTool(
      'ubah_revisi',
      {
        title: 'Ubah catatan revisi',
        description: 'Mengubah lokasi, jenis, atau teks catatan revisi; atau set status "dibuang" / kembali "draf".',
        inputSchema: {
          revisi_id: z.number().int(),
          lokasi: z.string().max(200).optional(),
          jenis: z.enum(['wajib', 'saran']).optional(),
          teks: z.string().min(3).max(4000).optional(),
          status: z.enum(['draf', 'dibuang']).optional(),
        },
      },
      async ({ revisi_id, ...patch }) => {
        try {
          const r = await ubahRevisi(revisi_id, patch);
          return json({ revisi_id: r.id, lokasi: r.lokasi, jenis: r.jenis, teks: r.teks, status: r.status });
        } catch (e) {
          return gagal((e as Error).message);
        }
      },
    );

    server.registerTool(
      'set_ringkasan',
      {
        title: 'Isi ringkasan',
        description: 'Mengisi ringkasan umum untuk mahasiswa pada sebuah berkas (belum dikirim).',
        inputSchema: { berkas_id: z.number().int(), ringkasan: z.string().max(4000) },
      },
      async ({ berkas_id, ringkasan }) => {
        await setRingkasan(berkas_id, ringkasan);
        return json({ berkas_id, ringkasan });
      },
    );

    server.registerTool(
      'kirim_revisi',
      {
        title: 'Kirim revisi ke mahasiswa',
        description:
          'Mengirim semua catatan draf ke mahasiswa dan menetapkan keputusan berkas. Lakukan hanya jika dosen sudah meminta untuk mengirim.',
        inputSchema: {
          berkas_id: z.number().int(),
          keputusan: z.enum(['perlu_revisi', 'disetujui']),
          ringkasan: z.string().max(4000).optional(),
        },
      },
      async ({ berkas_id, keputusan, ringkasan }) => {
        try {
          return json(await kirimRevisi(berkas_id, keputusan, ringkasan));
        } catch (e) {
          return gagal((e as Error).message);
        }
      },
    );
  },
  { serverInfo: { name: 'bimbingan-skripsi', version: '0.1.0' } },
  { basePath: '/api', maxDuration: 60, disableSse: true },
);

const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const hasil = await verifikasiToken(bearerToken);
    if (!hasil) return undefined;
    return { token: bearerToken, clientId: `dosen:${hasil.dosen.id}`, scopes: ['revisi'], extra: { dosenId: hasil.dosen.id } };
  },
  { required: true },
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
