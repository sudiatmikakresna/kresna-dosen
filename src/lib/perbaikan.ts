import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { berkas, cekPerbaikan, db } from '@/db';
import { TAHAP } from './labels';
import { versiSebelumnya } from './service';

/** Aturan approve dosen: setiap sub bab harus lebih dari 70% catatannya diperbaiki. */
export const AMBANG_PERSEN = 70;
/** Catatan yang dinilai berasal dari maksimal 2 bimbingan terakhir. */
export const JUMLAH_BIMBINGAN = 2;

/** Kunci sub bab dari lokasi catatan: nomor "1.2" bila ada, selain itu teks lokasinya. */
export function subBab(lokasi: string) {
  const nomor = lokasi.match(/(?<![\d.])(\d+\.\d+)/);
  if (nomor) return nomor[1];
  const bagian = lokasi
    .split('·')
    .map((s) => s.trim())
    .find((s) => s && !/^hal\.?\s*\d+$/i.test(s));
  return bagian || 'Umum';
}

const CARRY_OVER = /^Belum diperbaiki dari versi (\d+)/i;

export type RekapPerbaikan = NonNullable<Awaited<ReturnType<typeof rekapPerbaikan>>>;

/**
 * Rekap perbaikan untuk satu berkas bab (Bab 1–4). Null untuk Draf lengkap dan Dokumen lainnya,
 * yang tidak mengikuti aturan approve otomatis.
 */
export async function rekapPerbaikan(berkasId: number) {
  const [b] = await db().select().from(berkas).where(eq(berkas.id, berkasId)).limit(1);
  if (!b || !(TAHAP as readonly string[]).includes(b.jenis)) return null;

  const dibimbing = (await versiSebelumnya(b)).filter((l) => l.revisi.length > 0);
  const pengecekanKe = dibimbing.length + 1;
  const sumber = dibimbing.slice(0, JUMLAH_BIMBINGAN);
  const versiSumber = new Set(sumber.map((s) => s.versi));

  // Catatan "Belum diperbaiki dari versi N" adalah ulangan catatan lama; bila catatan aslinya ikut dinilai,
  // ulangannya dilewati supaya satu masalah tidak dihitung dua kali.
  const catatan = sumber.flatMap((l) =>
    l.revisi
      .filter((r) => {
        const m = r.teks.match(CARRY_OVER);
        return !(m && versiSumber.has(Number(m[1])));
      })
      .map((r) => ({ revisiId: r.id, versi: l.versi, subBab: subBab(r.lokasi), lokasi: r.lokasi, jenis: r.jenis, teks: r.teks, selesaiMenurutMahasiswa: r.selesai })),
  );

  const nilai = catatan.length
    ? await db()
        .select()
        .from(cekPerbaikan)
        .where(and(eq(cekPerbaikan.berkasId, b.id), inArray(cekPerbaikan.revisiId, catatan.map((c) => c.revisiId))))
    : [];
  const peta = new Map(nilai.map((n) => [n.revisiId, n]));
  const daftar = catatan.map((c) => ({ ...c, diperbaiki: peta.get(c.revisiId)?.diperbaiki ?? null, keterangan: peta.get(c.revisiId)?.keterangan ?? null }));

  const kelompok = new Map<string, { subBab: string; total: number; dinilai: number; diperbaiki: number }>();
  for (const c of daftar) {
    const k = kelompok.get(c.subBab) ?? { subBab: c.subBab, total: 0, dinilai: 0, diperbaiki: 0 };
    k.total += 1;
    if (c.diperbaiki !== null) k.dinilai += 1;
    if (c.diperbaiki) k.diperbaiki += 1;
    kelompok.set(c.subBab, k);
  }
  const perSubBab = [...kelompok.values()]
    .map((k) => ({ ...k, persen: Math.round((k.diperbaiki / k.total) * 1000) / 10, lolos: (k.diperbaiki / k.total) * 100 > AMBANG_PERSEN }))
    .sort((a, b) => a.subBab.localeCompare(b.subBab, 'id', { numeric: true }));

  const belumDinilai = daftar.filter((c) => c.diperbaiki === null).length;
  const semuaLolos = perSubBab.every((s) => s.lolos);
  const rekomendasi: 'perlu_revisi' | 'disetujui' | null =
    pengecekanKe < 2 ? 'perlu_revisi' : belumDinilai > 0 ? null : semuaLolos ? 'disetujui' : 'perlu_revisi';

  return {
    pengecekanKe,
    versiDinilai: [...versiSumber],
    catatan: daftar,
    perSubBab,
    belumDinilai,
    bolehDisetujui: pengecekanKe >= 2 && belumDinilai === 0 && semuaLolos,
    rekomendasi,
  };
}

/** Simpan penilaian perbaikan; hanya catatan yang termasuk rekap berkas ini yang diterima. */
export async function simpanPenilaian(berkasId: number, items: { revisiId: number; diperbaiki: boolean; keterangan?: string }[]) {
  const rekap = await rekapPerbaikan(berkasId);
  if (!rekap) throw new Error('Penilaian perbaikan hanya untuk berkas Bab 1–4.');
  const sah = new Set(rekap.catatan.map((c) => c.revisiId));
  const asing = items.filter((i) => !sah.has(i.revisiId)).map((i) => i.revisiId);
  if (asing.length) {
    throw new Error(`revisi_id ${asing.join(', ')} bukan catatan dari ${JUMLAH_BIMBINGAN} bimbingan terakhir berkas ini. Pakai id dari perbaikan.catatan di baca_berkas.`);
  }
  for (const i of items) {
    await db()
      .insert(cekPerbaikan)
      .values({ berkasId, revisiId: i.revisiId, diperbaiki: i.diperbaiki, keterangan: i.keterangan ?? null })
      .onConflictDoUpdate({
        target: [cekPerbaikan.berkasId, cekPerbaikan.revisiId],
        set: { diperbaiki: i.diperbaiki, keterangan: i.keterangan ?? null, createdAt: new Date() },
      });
  }
  return rekapPerbaikan(berkasId);
}

/** Ringkas rekap untuk respons MCP. */
export function rekapUntukAgent(r: RekapPerbaikan) {
  return {
    pengecekan_ke: r.pengecekanKe,
    aturan: `Disetujui hanya bila pengecekan ke-2 atau lebih dan setiap sub bab > ${AMBANG_PERSEN}% catatannya (dari maks. ${JUMLAH_BIMBINGAN} bimbingan terakhir) sudah diperbaiki.`,
    versi_dinilai: r.versiDinilai,
    per_sub_bab: r.perSubBab.map((s) => ({ sub_bab: s.subBab, diperbaiki: s.diperbaiki, total: s.total, dinilai: s.dinilai, persen: s.persen, lolos: s.lolos })),
    belum_dinilai: r.belumDinilai,
    boleh_disetujui: r.bolehDisetujui,
    rekomendasi_keputusan: r.rekomendasi,
  };
}
