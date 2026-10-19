import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { verifikasiBearer } from '@/lib/mcp-auth';
import { metadataPath } from '@/lib/oauth';
import { siskaSiap } from '@/lib/siska/client';
import { getKelas, jadwalTanggal, listKelas, mulaiSesi } from '@/lib/siska/kelas';
import { getPresensi, tutupPresensi, ubahPresensi } from '@/lib/siska/presensi';
import { daftarBimbingan, daftarKaryaAkhir, setujuiBimbingan } from '@/lib/siska/bimbingan';

export const maxDuration = 60;

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const gagal = (pesan: string) => ({ content: [{ type: 'text' as const, text: pesan }], isError: true });
const BACA = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;
const LABEL = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alfa' } as const;

/** Bungkus handler tool: cek SISKA_COOKIE dan ubah galat (mis. cookie kedaluwarsa) menjadi pesan untuk Claude. */
const aman =
  <A,>(fn: (args: A) => Promise<ReturnType<typeof json>>) =>
  async (args: A) => {
    if (!siskaSiap()) return gagal('SISKA_COOKIE belum diatur di Vercel.');
    try {
      return await fn(args);
    } catch (e) {
      return gagal((e as Error).message);
    }
  };

const idKelas = z.number().int().describe('id kelas kuliah SISKA (kelas_id dari daftar_kelas)');
const idPertemuan = z.number().int().describe('id pertemuan SISKA (pertemuan_id dari detail_kelas atau jadwal_mengajar)');

const jenisKarya = z
  .enum(['karya_terapan', 'skripsi'])
  .describe('karya_terapan = menu Daftar Karya Terapan (D4/Sarjana Terapan), skripsi = menu Daftar Skripsi');
const idKarya = z.number().int().describe('id_karya_akhir dari daftar_mahasiswa_karya_akhir');

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'daftar_mahasiswa_karya_akhir',
      {
        title: 'Daftar mahasiswa bimbingan karya akhir',
        description:
          'Mahasiswa skripsi atau karya terapan yang dibimbing dosen di SISKA (peran pembimbing): id_karya_akhir, NIM, nama, tahapan ' +
          '(Proposal / Skripsi / Karya Terapan), tahap detail, status, judul, dan pembimbing. Bawaan hanya status Aktif.',
        inputSchema: {
          jenis: jenisKarya,
          cari: z.string().max(100).optional().describe('Sebagian nama atau NIM'),
          hanya_aktif: z.boolean().optional().describe('Bawaan true'),
        },
        annotations: BACA,
      },
      aman(async ({ jenis, cari, hanya_aktif }) => json(await daftarKaryaAkhir(jenis, { cari, hanyaAktif: hanya_aktif }))),
    );

    server.registerTool(
      'daftar_bimbingan_karya_akhir',
      {
        title: 'Daftar bimbingan karya akhir',
        description:
          'Catatan bimbingan satu mahasiswa di SISKA: id_bimbingan, bimbingan ke-, tanggal, fase, topik, dosen, sudah disetujui atau belum, ' +
          'dan sumber (jadwal kelas bimbingan / diajukan mahasiswa). Bawaan hanya yang belum disetujui.',
        inputSchema: {
          jenis: jenisKarya,
          id_karya_akhir: idKarya,
          status: z.enum(['belum', 'disetujui', 'semua']).optional().describe('Bawaan belum'),
        },
        annotations: BACA,
      },
      aman(async ({ jenis, id_karya_akhir, status }) => json(await daftarBimbingan(jenis, id_karya_akhir, status ?? 'belum'))),
    );

    server.registerTool(
      'setujui_bimbingan_karya_akhir',
      {
        title: 'Setujui bimbingan karya akhir',
        description:
          'Menyetujui catatan bimbingan di SISKA atas nama dosen (sama dengan tombol "Setujui Terpilih"). Persetujuan tidak bisa dibatalkan ' +
          'dari SISKA, jadi tampilkan dulu daftar bimbingan yang akan disetujui (mahasiswa, tanggal, topik) dan minta konfirmasi dosen. ' +
          'Hanya id_bimbingan milik karya akhir itu yang diterima; hasilnya dibaca ulang dari SISKA.',
        inputSchema: {
          jenis: jenisKarya,
          id_karya_akhir: idKarya,
          id_bimbingan: z.array(z.number().int()).min(1).max(50).describe('id_bimbingan dari daftar_bimbingan_karya_akhir'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      aman(async ({ jenis, id_karya_akhir, id_bimbingan }) => json(await setujuiBimbingan(jenis, id_karya_akhir, id_bimbingan))),
    );

    server.registerTool(
      'daftar_kelas',
      {
        title: 'Daftar kelas',
        description: 'Kelas kuliah yang diampu dosen pada periode berjalan di SISKA: mata kuliah, kelas, jadwal, dan jumlah peserta.',
        inputSchema: {},
        annotations: BACA,
      },
      aman(async () => {
        const kelas = await listKelas();
        return json(kelas.map(({ id, ...k }) => ({ kelas_id: id, ...k })));
      }),
    );

    server.registerTool(
      'jadwal_mengajar',
      {
        title: 'Jadwal mengajar',
        description: 'Pertemuan kuliah pada satu tanggal (bawaan hari ini, WITA) beserta statusnya: TERJADWAL, MULAI, SELESAI, atau DIGANTI.',
        inputSchema: { tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD') },
        annotations: BACA,
      },
      aman(async ({ tanggal }) =>
        json((await jadwalTanggal(tanggal)).map(({ kelasId, pertemuanId, ...x }) => ({ kelas_id: kelasId, pertemuan_id: pertemuanId, ...x }))),
      ),
    );

    server.registerTool(
      'detail_kelas',
      {
        title: 'Detail kelas',
        description: 'Semua pertemuan satu kelas (ke-, tanggal, jam, ruang, status) untuk mencari pertemuan_id.',
        inputSchema: { kelas_id: idKelas },
        annotations: BACA,
      },
      aman(async ({ kelas_id }) => {
        const k = await getKelas(kelas_id);
        const { id, pertemuan, ...info } = k;
        return json({ kelas_id: id, ...info, pertemuan: pertemuan.map(({ id: pertemuan_id, ...p }) => ({ pertemuan_id, ...p })) });
      }),
    );

    server.registerTool(
      'lihat_presensi',
      {
        title: 'Lihat presensi',
        description: 'Daftar peserta satu pertemuan dengan status Hadir/Sakit/Izin/Alfa/belum diisi, keterangan, dan rekap jumlahnya.',
        inputSchema: { kelas_id: idKelas, pertemuan_id: idPertemuan },
        annotations: BACA,
      },
      aman(async ({ kelas_id, pertemuan_id }) => {
        const { pertemuanKe, peserta } = await getPresensi(kelas_id, pertemuan_id);
        const rekap = { Hadir: 0, Sakit: 0, Izin: 0, Alfa: 0, 'Belum diisi': 0 };
        for (const p of peserta) rekap[p.status ? LABEL[p.status] : 'Belum diisi'] += 1;
        return json({
          pertemuan_ke: pertemuanKe ?? null,
          rekap,
          peserta: peserta.map((p) => ({ nim: p.nim, nama: p.nama, status: p.status ? LABEL[p.status] : null, keterangan: p.keterangan, terkunci: p.terkunci })),
        });
      }),
    );

    server.registerTool(
      'mulai_pertemuan',
      {
        title: 'Mulai pertemuan',
        description: 'Memulai pertemuan berstatus TERJADWAL di SISKA (status menjadi MULAI) supaya presensi bisa diisi. Lakukan hanya bila dosen memintanya.',
        inputSchema: { pertemuan_id: idPertemuan },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      aman(async ({ pertemuan_id }) => {
        await mulaiSesi(pertemuan_id);
        return json({ dimulai: true, pertemuan_id });
      }),
    );

    server.registerTool(
      'ubah_presensi',
      {
        title: 'Ubah presensi',
        description:
          'Menyimpan status presensi (H=Hadir, S=Sakit, I=Izin, A=Alfa) untuk satu atau beberapa mahasiswa pada satu pertemuan, atas nama dosen. ' +
          'Hanya mahasiswa yang disebut yang berubah. Lakukan hanya sesuai permintaan dosen.',
        inputSchema: {
          kelas_id: idKelas,
          pertemuan_id: idPertemuan,
          perubahan: z
            .array(
              z.object({
                nim: z.string().min(3).max(20),
                status: z.enum(['H', 'S', 'I', 'A']),
                keterangan: z.string().max(200).optional().describe('mis. "Izin sakit, surat dokter"'),
              }),
            )
            .min(1)
            .max(100),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      aman(async ({ kelas_id, pertemuan_id, perubahan }) => json(await ubahPresensi(kelas_id, pertemuan_id, perubahan))),
    );

    server.registerTool(
      'tutup_presensi',
      {
        title: 'Tutup presensi',
        description:
          'Menutup presensi satu pertemuan: setiap mahasiswa yang belum punya status diisi Alfa. Tidak bisa dibatalkan otomatis, jadi konfirmasi ke dosen dulu.',
        inputSchema: { kelas_id: idKelas, pertemuan_id: idPertemuan },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      aman(async ({ kelas_id, pertemuan_id }) => json({ diisi_alfa: await tutupPresensi(kelas_id, pertemuan_id) })),
    );
  },
  { serverInfo: { name: 'siska-presensi', version: '0.1.0' } },
  { basePath: '/api/siska', maxDuration: 60, disableSse: true },
);

const authHandler = withMcpAuth(handler, (_req, bearer) => verifikasiBearer(bearer, 'siska'), {
  required: true,
  resourceMetadataPath: metadataPath('siska'),
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
