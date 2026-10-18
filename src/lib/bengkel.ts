import 'server-only';
import { Pool } from 'pg';

/**
 * Data Bengkel Flutter (auto-grader Pemrograman Mobile, kresna.blog) untuk bot WhatsApp.
 * Database utama Bengkel ada di mesin dosen; salinannya disinkron ke Neon tiap ±5 menit
 * (schema `bengkel`, lihat src/cli/sinkron_neon.ts di repo bengkel). Di sini hanya dibaca (SELECT).
 *
 * Aturan poin harian kelas: soal D1/D2 lulus = 2 poin, D3 = 5 poin, modul lain 0. Yang dihitung soal
 * BERBEDA yang lulus pada tanggal itu sebelum jam batas (bawaan 22.00 WITA). Target 10 poin.
 */

export const bengkelSiap = () => !!process.env.BENGKEL_DATABASE_URL;

const TARGET_POIN = 10;
const ZONA = 'Asia/Makassar';

let pool: Pool | null = null;
function bengkelDb() {
  if (!bengkelSiap()) throw new Error('BENGKEL_DATABASE_URL belum diatur.');
  pool ??= new Pool({ connectionString: process.env.BENGKEL_DATABASE_URL, max: 2, statement_timeout: 15_000 });
  return pool;
}

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await bengkelDb().query(sql, params)).rows as T[];
}

/** Waktu data terakhir disalin dari Bengkel, dalam WITA, plus peringatan bila sudah lama. */
async function waktuData() {
  const [r] = await q<{ waktu: string; menit: number }>(
    `SELECT to_char(waktu AT TIME ZONE '${ZONA}', 'DD Mon YYYY HH24:MI') AS waktu,
            floor(extract(epoch FROM now() - waktu) / 60)::int AS menit
       FROM bengkel.sinkron LIMIT 1`,
  );
  if (!r) return { dataPer: null, peringatan: 'Data Bengkel belum pernah disinkron.' };
  return {
    dataPer: `${r.waktu} WITA`,
    peringatan: r.menit > 15 ? `Data terakhir disinkron ${r.menit} menit lalu, mungkin belum memuat kiriman terbaru.` : null,
  };
}

type Kelas = { kode: string; nama: string; hari: string; grup_wa: string };

/**
 * Cari kelas dari teks bebas (kode SISKA "4702", hari "kamis", "jumat pagi", nama "TI PAGI1"),
 * atau dari ID grup WhatsApp tempat pertanyaan diajukan.
 */
async function cariKelas(teks: string | undefined, chatId: string | undefined): Promise<Kelas[]> {
  const semua = await q<Kelas>('SELECT kode, nama, hari, grup_wa FROM bengkel.kelas ORDER BY kode');
  const t = (teks ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (t) {
    const cocok = semua.filter((k) => {
      const nama = k.nama.toLowerCase();
      const hari = k.hari.toLowerCase();
      return k.kode === t || nama.includes(t) || hari === t || hari.startsWith(t) || t.includes(hari) || nama.endsWith(t);
    });
    // "jumat" cocok dengan dua kelas; "jumat pagi" hanya satu.
    const persis = cocok.filter((k) => t.includes(k.hari.toLowerCase()));
    return persis.length ? persis : cocok;
  }
  return chatId ? semua.filter((k) => k.grup_wa === chatId) : [];
}

/** Jawaban bila kelas tidak bisa ditentukan: daftar pilihan supaya Claude bisa bertanya balik. */
async function perluKelas(cocok: Kelas[]) {
  const pilihan = cocok.length ? cocok : await q<Kelas>('SELECT kode, nama, hari, grup_wa FROM bengkel.kelas ORDER BY kode');
  return {
    hasil: 'perlu_kelas',
    pesan: cocok.length ? 'Lebih dari satu kelas cocok, sebutkan lebih spesifik.' : 'Kelas tidak dikenali dari grup ini. Sebutkan kelasnya.',
    pilihan: pilihan.map((k) => `${k.nama} (${k.hari}, kode ${k.kode})`),
  };
}

const jamValid =(v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3])[:.][0-5]\d$/.test(v) ? v.replace('.', ':') : '22:00');
const tanggalValid = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Poin harian per mahasiswa untuk satu kelas. */
export async function poinKelasBengkel(f: { kelas?: string; tanggal?: string; batasJam?: string }, chatId?: string) {
  const kelas = await cariKelas(f.kelas, chatId);
  if (kelas.length !== 1) return perluKelas(kelas);
  const k = kelas[0];
  const batas = jamValid(f.batasJam);
  const [{ hari_ini }] = await q<{ hari_ini: string }>(`SELECT (now() AT TIME ZONE '${ZONA}')::date::text AS hari_ini`);
  const tanggal = tanggalValid(f.tanggal) ?? hari_ini;
  const baris = await q<{ nim: string; nama: string; punya_akun: boolean; poin: number; d1: number; d2: number; d3: number; terakhir: string | null }>(
    `WITH anggota AS (
       SELECT a.nim, a.nama,
              (SELECT array_agg(m.id) FROM bengkel.mahasiswa m WHERE m.npm = a.nim OR upper(m.nama) = upper(a.nama)) AS ids
         FROM bengkel.kelas_anggota a WHERE a.kode = $1
     ), lulus AS (
       SELECT DISTINCT a.nim, s.soal_id
         FROM anggota a JOIN bengkel.submission s ON s.mahasiswa_id = ANY (a.ids)
        WHERE s.lulus
          AND (s.created_at AT TIME ZONE '${ZONA}')::date = $2::date
          AND (s.created_at AT TIME ZONE '${ZONA}')::time < $3::time
     )
     SELECT a.nim, a.nama, a.ids IS NOT NULL AS punya_akun,
            COALESCE(sum(CASE WHEN l.soal_id LIKE 'D3-%' THEN 5 WHEN l.soal_id ~ '^D[12]-' THEN 2 ELSE 0 END), 0)::int AS poin,
            count(l.soal_id) FILTER (WHERE l.soal_id LIKE 'D1-%')::int AS d1,
            count(l.soal_id) FILTER (WHERE l.soal_id LIKE 'D2-%')::int AS d2,
            count(l.soal_id) FILTER (WHERE l.soal_id LIKE 'D3-%')::int AS d3,
            (SELECT to_char(max(s.created_at AT TIME ZONE '${ZONA}'), 'HH24:MI') FROM bengkel.submission s
              WHERE s.mahasiswa_id = ANY (a.ids) AND (s.created_at AT TIME ZONE '${ZONA}')::date = $2::date) AS terakhir
       FROM anggota a LEFT JOIN lulus l ON l.nim = a.nim
      GROUP BY a.nim, a.nama, a.ids
      ORDER BY poin DESC, a.nama`,
    [k.kode, tanggal, batas],
  );
  const memenuhi = baris.filter((b) => b.poin >= TARGET_POIN);
  return {
    sumber: 'Bengkel Flutter (kresna.blog)',
    ...(await waktuData()),
    kelas: `${k.nama} (${k.hari}, kode ${k.kode})`,
    tanggal,
    aturan: `D1/D2 = 2 poin, D3 = 5 poin per soal berbeda yang lulus pada tanggal itu sebelum pukul ${batas} WITA. Target ${TARGET_POIN} poin.`,
    ringkasan: {
      anggota: baris.length,
      memenuhiTarget: memenuhi.length,
      sudahMulaiBelumCukup: baris.filter((b) => b.poin > 0 && b.poin < TARGET_POIN).length,
      belumAdaPoin: baris.filter((b) => b.poin === 0).length,
    },
    mahasiswa: baris.map((b) => ({
      nim: b.nim,
      nama: b.nama,
      poin: b.poin,
      soalLulus: { D1: b.d1, D2: b.d2, D3: b.d3 },
      kirimanTerakhirHariItu: b.terakhir,
      ...(b.punya_akun ? {} : { catatan: 'Belum punya akun Bengkel.' }),
    })),
  };
}

/** Status satu mahasiswa: progres per modul, kiriman terakhir, push yang ditolak, dan poin hari ini. */
export async function statusMahasiswaBengkel(cari: string) {
  const c = cari.trim().slice(0, 100);
  if (c.length < 3) return { hasil: 'error', pesan: 'Isi NIM atau nama minimal 3 huruf.' };
  const orang = await q<{ id: number; npm: string; nama: string; github_login: string; repo_full: string }>(
    `SELECT id, npm, nama, github_login, repo_full FROM bengkel.mahasiswa
      WHERE aktif AND (npm LIKE '%' || $1 || '%' OR nama ILIKE '%' || $1 || '%')
      ORDER BY nama LIMIT 6`,
    [c],
  );
  if (orang.length === 0) return { hasil: 'tidak_ditemukan', pesan: `Tidak ada mahasiswa Bengkel yang cocok dengan "${c}".` };
  if (orang.length > 5) return { hasil: 'terlalu_banyak', pesan: 'Lebih dari 5 mahasiswa cocok, pakai NIM atau nama yang lebih lengkap.', contoh: orang.map((o) => `${o.nama} (${o.npm})`) };

  const detail = await Promise.all(
    orang.map(async (o) => {
      const [kelas, modul, terakhir, ditolak, hariIni] = await Promise.all([
        q<{ nama: string }>(
          `SELECT k.nama || ' (' || k.hari || ')' AS nama FROM bengkel.kelas_anggota a JOIN bengkel.kelas k USING (kode)
            WHERE a.nim = $1 OR upper(a.nama) = upper($2)`,
          [o.npm, o.nama],
        ),
        q<{ modul: string; lulus: number; dicoba: number }>(
          `SELECT split_part(soal_id, '-', 1) AS modul,
                  count(DISTINCT soal_id) FILTER (WHERE lulus)::int AS lulus,
                  count(DISTINCT soal_id)::int AS dicoba
             FROM bengkel.submission WHERE mahasiswa_id = $1 GROUP BY 1 ORDER BY 1`,
          [o.id],
        ),
        q<{ soal_id: string; status: string; lulus: boolean | null; skor: string | null; waktu: string }>(
          `SELECT soal_id, status, lulus, skor::text, to_char(created_at AT TIME ZONE '${ZONA}', 'DD Mon HH24:MI') AS waktu
             FROM bengkel.submission WHERE mahasiswa_id = $1 ORDER BY id DESC LIMIT 5`,
          [o.id],
        ),
        q<{ soal_id: string | null; error: string; waktu: string; pesan: string | null }>(
          `SELECT soal_id, error, to_char(created_at AT TIME ZONE '${ZONA}', 'DD Mon HH24:MI') AS waktu, left(pesan, 300) AS pesan
             FROM bengkel.push_ditolak WHERE repo_full = $1 ORDER BY id DESC LIMIT 3`,
          [o.repo_full],
        ),
        q<{ poin: number }>(
          `SELECT COALESCE(sum(CASE WHEN soal_id LIKE 'D3-%' THEN 5 WHEN soal_id ~ '^D[12]-' THEN 2 ELSE 0 END), 0)::int AS poin
             FROM (SELECT DISTINCT soal_id FROM bengkel.submission
                    WHERE mahasiswa_id = $1 AND lulus
                      AND (created_at AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date
                      AND (created_at AT TIME ZONE '${ZONA}')::time < '22:00') x`,
          [o.id],
        ),
      ]);
      return {
        nim: o.npm,
        nama: o.nama,
        github: o.github_login,
        kelas: kelas.map((x) => x.nama),
        soalLulusPerModul: Object.fromEntries(modul.map((m) => [m.modul, `${m.lulus} lulus dari ${m.dicoba} yang dicoba`])),
        kirimanTerakhir: terakhir.map((s) => ({ soal: s.soal_id, status: s.status, lulus: s.lulus, skor: s.skor, waktu: s.waktu })),
        pushDitolakTerakhir: ditolak,
        poinHariIni: hariIni[0]?.poin ?? 0,
      };
    }),
  );
  return { sumber: 'Bengkel Flutter (kresna.blog)', ...(await waktuData()), mahasiswa: detail };
}

/** Aktivitas jangka panjang satu kelas: total soal lulus per modul dan kapan terakhir mengirim. */
export async function aktivitasKelasBengkel(f: { kelas?: string; diamHari?: number }, chatId?: string) {
  const kelas = await cariKelas(f.kelas, chatId);
  if (kelas.length !== 1) return perluKelas(kelas);
  const k = kelas[0];
  const diam = Number.isInteger(f.diamHari) && f.diamHari! > 0 && f.diamHari! <= 60 ? f.diamHari! : 7;
  const baris = await q<{ nim: string; nama: string; d1: number; d2: number; d3: number; terakhir: string | null; hari_diam: number | null }>(
    `WITH anggota AS (
       SELECT a.nim, a.nama,
              (SELECT array_agg(m.id) FROM bengkel.mahasiswa m WHERE m.npm = a.nim OR upper(m.nama) = upper(a.nama)) AS ids
         FROM bengkel.kelas_anggota a WHERE a.kode = $1
     )
     SELECT a.nim, a.nama,
            count(DISTINCT s.soal_id) FILTER (WHERE s.lulus AND s.soal_id LIKE 'D1-%')::int AS d1,
            count(DISTINCT s.soal_id) FILTER (WHERE s.lulus AND s.soal_id LIKE 'D2-%')::int AS d2,
            count(DISTINCT s.soal_id) FILTER (WHERE s.lulus AND s.soal_id LIKE 'D3-%')::int AS d3,
            to_char(max(s.created_at AT TIME ZONE '${ZONA}'), 'DD Mon YYYY') AS terakhir,
            (extract(epoch FROM now() - max(s.created_at)) / 86400)::int AS hari_diam
       FROM anggota a LEFT JOIN bengkel.submission s ON s.mahasiswa_id = ANY (a.ids)
      GROUP BY a.nim, a.nama
      ORDER BY hari_diam DESC NULLS FIRST, a.nama`,
    [k.kode],
  );
  return {
    sumber: 'Bengkel Flutter (kresna.blog)',
    ...(await waktuData()),
    kelas: `${k.nama} (${k.hari}, kode ${k.kode})`,
    catatan: 'Jumlah soal yang pernah lulus sepanjang semester per modul: D1 dari 50, D2 dari 25, D3 dari 21.',
    tidakMengirimLebihDari: { hari: diam, mahasiswa: baris.filter((b) => b.hari_diam === null || b.hari_diam > diam).map((b) => b.nama) },
    mahasiswa: baris.map((b) => ({
      nim: b.nim,
      nama: b.nama,
      soalLulus: { D1: b.d1, D2: b.d2, D3: b.d3 },
      kirimanTerakhir: b.terakhir ?? 'belum pernah',
    })),
  };
}
