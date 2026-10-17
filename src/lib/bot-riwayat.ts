import 'server-only';
import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { berkas, db, revisi, users } from '@/db';
import { TAHAP, labelJenisPendek, status as labelStatus, tanggal } from './labels';
import { rekapPerbaikan } from './perbaikan';
import { tahapDari } from './service';

/**
 * Data riwayat bimbingan untuk bot tanya-jawab WhatsApp. Sengaja ringkas, sama seperti laporan grup:
 * nama, bab, versi, tanggal, keputusan, jumlah catatan, dan progres perbaikan. Isi catatan revisi, NIM,
 * dan isi berkas tidak pernah dikembalikan, jadi juga tidak bisa dikutip bot di grup.
 */

const MAKS_COCOK = 5;

function statusVersi(b: { status: string; keputusanAt: Date | null }) {
  // Versi yang disetujui tidak pernah digantikan, jadi versi "digantikan" yang sudah diputus berarti dulu perlu revisi.
  if (b.status === 'digantikan') return b.keputusanAt ? 'Perlu revisi (sudah diganti versi baru)' : 'Diganti versi baru sebelum direview';
  return labelStatus(b.status).label;
}

async function mahasiswaCocok(nama: string) {
  const kata = nama
    .replace(/[%_\\]/g, ' ')
    .split(/\s+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2)
    .slice(0, 5);
  if (kata.length === 0) return [];
  return db()
    .select({ id: users.id, nama: users.nama })
    .from(users)
    .where(and(eq(users.role, 'mahasiswa'), ...kata.map((k) => ilike(users.nama, `%${k}%`))))
    .orderBy(asc(users.nama))
    .limit(MAKS_COCOK + 1);
}

/** Riwayat bimbingan satu atau beberapa mahasiswa yang namanya cocok. */
export async function riwayatBimbingan(nama: string) {
  const cocok = await mahasiswaCocok(nama);
  if (cocok.length === 0) return { hasil: 'tidak_ditemukan', pesan: `Tidak ada mahasiswa bimbingan dengan nama "${nama}".` };
  if (cocok.length > MAKS_COCOK) {
    return { hasil: 'terlalu_banyak', pesan: 'Terlalu banyak nama yang cocok; minta nama yang lebih lengkap.', contoh: cocok.slice(0, MAKS_COCOK).map((m) => m.nama) };
  }

  const ids = cocok.map((m) => m.id);
  const semua = await db().select().from(berkas).where(inArray(berkas.mahasiswaId, ids)).orderBy(asc(berkas.versi));
  const jumlah = semua.length
    ? await db()
        .select({
          berkasId: revisi.berkasId,
          wajib: sql<number>`count(*) filter (where ${revisi.jenis} = 'wajib')::int`,
          saran: sql<number>`count(*) filter (where ${revisi.jenis} = 'saran')::int`,
          ditandaiSelesai: sql<number>`count(*) filter (where ${revisi.selesai})::int`,
        })
        .from(revisi)
        .where(and(inArray(revisi.berkasId, semua.map((b) => b.id)), eq(revisi.status, 'dikirim')))
        .groupBy(revisi.berkasId)
    : [];
  const petaJumlah = new Map(jumlah.map((j) => [j.berkasId, j]));

  const mahasiswa = await Promise.all(
    cocok.map(async (m) => {
      const milik = semua.filter((b) => b.mahasiswaId === m.id);
      const tahap = await Promise.all(
        TAHAP.map(async (jenis) => {
          const versi = milik.filter((b) => b.jenis === jenis);
          if (versi.length === 0) return { bab: labelJenisPendek(jenis), status: 'Belum diunggah' };
          const terbaru = versi[versi.length - 1];
          const rekap = terbaru.status === 'disetujui' ? null : await rekapPerbaikan(terbaru.id);
          return {
            bab: labelJenisPendek(jenis),
            status: labelStatus(tahapDari(versi).find((t) => t.jenis === jenis)?.status ?? 'belum').label,
            jumlahVersi: versi.length,
            riwayat: versi.map((b) => {
              const j = petaJumlah.get(b.id);
              return {
                versi: b.versi,
                diunggah: tanggal(b.createdAt),
                status: statusVersi(b),
                ditanggapi: b.keputusanAt ? tanggal(b.keputusanAt) : null,
                catatanWajib: j?.wajib ?? 0,
                catatanSaran: j?.saran ?? 0,
                ditandaiSelesaiOlehMahasiswa: j?.ditandaiSelesai ?? 0,
              };
            }),
            ...(rekap && rekap.perSubBab.length
              ? {
                  progresPerbaikanVersiTerakhir: {
                    pengecekanKe: rekap.pengecekanKe,
                    syaratDisetujui: 'lebih dari 70% catatan dari 2 bimbingan terakhir diperbaiki di setiap sub bab',
                    perSubBab: rekap.perSubBab.map((s) => ({ subBab: s.subBab, diperbaiki: s.diperbaiki, total: s.total, persen: s.persen, lolos: s.lolos })),
                    belumDinilai: rekap.belumDinilai,
                  },
                }
              : {}),
          };
        }),
      );
      const lain = milik.filter((b) => !(TAHAP as readonly string[]).includes(b.jenis));
      const terakhir = milik.reduce<Date | null>((t, b) => (!t || b.createdAt > t ? b.createdAt : t), null);
      return {
        nama: m.nama,
        unggahanTerakhir: terakhir ? tanggal(terakhir) : null,
        tahap,
        draf_lengkap_dan_lainnya: lain.length ? lain.map((b) => ({ jenis: labelJenisPendek(b.jenis), versi: b.versi, diunggah: tanggal(b.createdAt), status: statusVersi(b) })) : [],
      };
    }),
  );
  return { hasil: 'ditemukan', mahasiswa };
}

/** Ringkasan progres semua mahasiswa bimbingan: status terakhir Bab 1–4 dan tanggal unggahan terakhir. */
export async function progresSemuaMahasiswa() {
  const mhs = await db().select({ id: users.id, nama: users.nama }).from(users).where(eq(users.role, 'mahasiswa')).orderBy(asc(users.nama));
  const semua = await db()
    .select({ mahasiswaId: berkas.mahasiswaId, jenis: berkas.jenis, versi: berkas.versi, status: berkas.status, createdAt: berkas.createdAt })
    .from(berkas)
    .orderBy(desc(berkas.createdAt));
  return {
    jumlahMahasiswa: mhs.length,
    mahasiswa: mhs.map((m) => {
      const milik = semua.filter((b) => b.mahasiswaId === m.id);
      return {
        nama: m.nama,
        unggahanTerakhir: milik[0] ? tanggal(milik[0].createdAt) : null,
        tahap: Object.fromEntries(
          tahapDari(milik).map((t) => {
            const versi = milik.filter((b) => b.jenis === t.jenis).length;
            return [labelJenisPendek(t.jenis), versi ? `${labelStatus(t.status).label} (${versi} versi)` : 'Belum diunggah'];
          }),
        ),
      };
    }),
  };
}
