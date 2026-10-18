import 'server-only';
import { createClient, type Client } from '@libsql/client';
import { waktu } from './labels';

/**
 * Data kelas SPK dari aplikasi idea-spk (https://idea-spk.vercel.app), database Turso terpisah.
 * Hanya dibaca (SELECT); pakai token read-only: turso db tokens create <db> --read-only.
 * Isinya sama dengan yang tampil publik di situs idea-spk: NIM, ide studi kasus, algoritma, dan link tugas.
 */

export const spkSiap = () => !!process.env.SPK_TURSO_DATABASE_URL;

let client: Client | null = null;
function spkDb() {
  if (!spkSiap()) throw new Error('SPK_TURSO_DATABASE_URL belum diatur.');
  client ??= createClient({ url: process.env.SPK_TURSO_DATABASE_URL!, authToken: process.env.SPK_TURSO_AUTH_TOKEN });
  return client;
}

// created_at SQLite berupa UTC "YYYY-MM-DD HH:MM:SS".
const tgl = (v: unknown) => (typeof v === 'string' && v ? waktu(new Date(`${v.replace(' ', 'T')}Z`)) : null);

const MAKS_IDE_RINGKAS = 300;

/** Ide studi kasus dan pengumpulan tugas mahasiswa kelas SPK, dengan filter NIM (sebagian) atau algoritma. */
export async function dataKelasSpk(filter: { nim?: string; algoritma?: string }) {
  const db = spkDb();
  const nim = filter.nim?.replace(/[^0-9A-Za-z]/g, '').slice(0, 20) || null;
  const algoritma = filter.algoritma?.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 10) || null;
  const [rows, total] = await Promise.all([
    db.execute({
      sql: `SELECT s.nim, s.ide, s.algoritma, s.created_at AS submit_at, t.link, t.created_at AS tugas_at
            FROM submissions s LEFT JOIN tugas t ON t.nim = s.nim
            WHERE (? IS NULL OR s.nim LIKE '%' || ? || '%')
              AND (? IS NULL OR (',' || s.algoritma || ',') LIKE '%,' || ? || ',%')
            ORDER BY s.id`,
      args: [nim, nim, algoritma, algoritma],
    }),
    db.execute(`SELECT (SELECT count(*) FROM submissions) AS ide, (SELECT count(*) FROM tugas) AS tugas`),
  ]);
  // Tugas tanpa ide tidak bisa terjadi lewat aplikasi (tugas wajib submit ide dulu), jadi cukup dari submissions.
  const satu = rows.rows.length === 1 || !!nim;
  const mahasiswa = rows.rows.map((r) => {
    const ide = String(r.ide ?? '');
    return {
      nim: String(r.nim),
      ide: satu || ide.length <= MAKS_IDE_RINGKAS ? ide : `${ide.slice(0, MAKS_IDE_RINGKAS)}…`,
      algoritma: String(r.algoritma ?? '').split(',').filter(Boolean),
      submitIde: tgl(r.submit_at),
      tugas: r.link ? { link: String(r.link), dikumpulkan: tgl(r.tugas_at) } : null,
    };
  });
  const frekuensi: Record<string, number> = {};
  for (const m of mahasiswa) for (const a of m.algoritma) frekuensi[a] = (frekuensi[a] ?? 0) + 1;
  return {
    sumber: 'idea-spk.vercel.app',
    totalKelas: { submitIde: Number(total.rows[0]?.ide ?? 0), kumpulTugas: Number(total.rows[0]?.tugas ?? 0) },
    filter: { nim, algoritma },
    hasil: {
      jumlah: mahasiswa.length,
      sudahKumpulTugas: mahasiswa.filter((m) => m.tugas).length,
      belumKumpulTugas: mahasiswa.filter((m) => !m.tugas).map((m) => m.nim),
      frekuensiAlgoritma: frekuensi,
    },
    mahasiswa,
    catatan: 'Hanya mahasiswa yang sudah submit ide yang tercatat; NIM yang tidak ada berarti belum submit ide sama sekali.',
  };
}
