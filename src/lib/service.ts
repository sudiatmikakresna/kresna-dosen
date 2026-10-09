import 'server-only';
import { and, asc, desc, eq, inArray, lt, ne } from 'drizzle-orm';
import { aktivitas, berkas, db, revisi, users, type Berkas, type Revisi } from '@/db';
import { labelJenisPendek, TAHAP } from './labels';

export type StatusBerkas = Berkas['status'];

export async function catatAktivitas(mahasiswaId: number, teks: string, berkasId?: number) {
  await db().insert(aktivitas).values({ mahasiswaId, teks, berkasId });
}

export async function simpanBerkasBaru(
  mahasiswaId: number,
  data: {
    jenis: string;
    sumber: 'upload' | 'gdocs';
    fileUrl?: string | null;
    fileName?: string | null;
    gdocsUrl?: string | null;
    catatan?: string | null;
    teks?: string | null;
  },
) {
  const sebelumnya = await db()
    .select({ id: berkas.id, versi: berkas.versi, status: berkas.status })
    .from(berkas)
    .where(and(eq(berkas.mahasiswaId, mahasiswaId), eq(berkas.jenis, data.jenis)))
    .orderBy(desc(berkas.versi));
  const versi = (sebelumnya[0]?.versi ?? 0) + 1;

  const aktif = sebelumnya.filter((b) => b.status !== 'disetujui' && b.status !== 'digantikan').map((b) => b.id);
  if (aktif.length) {
    await db().update(berkas).set({ status: 'digantikan' }).where(inArray(berkas.id, aktif));
  }

  const [baru] = await db()
    .insert(berkas)
    .values({ mahasiswaId, versi, ...data })
    .returning();
  await catatAktivitas(mahasiswaId, `Mengunggah ${labelJenisPendek(data.jenis)} versi ${versi}`, baru.id);
  return baru;
}

/** Status terakhir tiap tahap (proposal–bab 5) untuk satu mahasiswa. */
export function tahapDari(daftar: Pick<Berkas, 'jenis' | 'versi' | 'status'>[]) {
  return TAHAP.map((jenis) => {
    const versi = daftar.filter((b) => b.jenis === jenis).sort((a, b) => b.versi - a.versi);
    const disetujui = versi.some((b) => b.status === 'disetujui');
    const terbaru = versi.find((b) => b.status !== 'digantikan') ?? versi[0];
    const st = disetujui ? 'disetujui' : terbaru ? terbaru.status : 'belum';
    return { jenis, status: st };
  });
}

export async function berkasMahasiswa(mahasiswaId: number) {
  return db().select().from(berkas).where(eq(berkas.mahasiswaId, mahasiswaId)).orderBy(desc(berkas.createdAt));
}

export async function aktivitasMahasiswa(mahasiswaId: number, limit = 10) {
  return db()
    .select()
    .from(aktivitas)
    .where(eq(aktivitas.mahasiswaId, mahasiswaId))
    .orderBy(desc(aktivitas.createdAt))
    .limit(limit);
}

export async function daftarMahasiswa() {
  const mhs = await db().select().from(users).where(eq(users.role, 'mahasiswa')).orderBy(asc(users.nama));
  const semua = await db().select().from(berkas).orderBy(desc(berkas.createdAt));
  const akt = await db()
    .selectDistinctOn([aktivitas.mahasiswaId], { mahasiswaId: aktivitas.mahasiswaId, createdAt: aktivitas.createdAt })
    .from(aktivitas)
    .orderBy(aktivitas.mahasiswaId, desc(aktivitas.createdAt));
  return mhs.map((m) => {
    const milik = semua.filter((b) => b.mahasiswaId === m.id);
    const tahap = tahapDari(milik);
    const terakhir = milik[0] ?? null;
    const aktifTerakhir = akt.find((a) => a.mahasiswaId === m.id)?.createdAt ?? m.createdAt;
    return {
      id: m.id,
      nama: m.nama,
      nim: m.nim ?? '',
      judulSkripsi: m.judulSkripsi,
      tahapSelesai: tahap.filter((t) => t.status === 'disetujui').length,
      tahap,
      berkasTerakhir: terakhir,
      aktifTerakhir,
      tidakAktif: Date.now() - aktifTerakhir.getTime() > 14 * 86_400_000,
    };
  });
}

export async function antrianReview() {
  return db()
    .select({
      id: berkas.id,
      jenis: berkas.jenis,
      versi: berkas.versi,
      status: berkas.status,
      createdAt: berkas.createdAt,
      mahasiswaId: users.id,
      nama: users.nama,
      nim: users.nim,
    })
    .from(berkas)
    .innerJoin(users, eq(users.id, berkas.mahasiswaId))
    .where(inArray(berkas.status, ['menunggu', 'draf']))
    .orderBy(asc(berkas.createdAt));
}

export async function detailBerkas(id: number) {
  const [row] = await db()
    .select({ berkas, mahasiswa: users })
    .from(berkas)
    .innerJoin(users, eq(users.id, berkas.mahasiswaId))
    .where(eq(berkas.id, id))
    .limit(1);
  if (!row) return null;
  const daftarRevisi = await db().select().from(revisi).where(eq(revisi.berkasId, id)).orderBy(asc(revisi.id));
  return { ...row, revisi: daftarRevisi };
}

/** Versi-versi sebelumnya dari jenis berkas yang sama, beserta revisi yang sudah dikirim. */
export async function versiSebelumnya(b: Pick<Berkas, 'mahasiswaId' | 'jenis' | 'versi'>) {
  const lama = await db()
    .select()
    .from(berkas)
    .where(and(eq(berkas.mahasiswaId, b.mahasiswaId), eq(berkas.jenis, b.jenis), lt(berkas.versi, b.versi)))
    .orderBy(desc(berkas.versi));
  if (!lama.length) return [];
  const rev = await db()
    .select()
    .from(revisi)
    .where(and(inArray(revisi.berkasId, lama.map((l) => l.id)), eq(revisi.status, 'dikirim')))
    .orderBy(asc(revisi.id));
  return lama.map((l) => ({ ...l, revisi: rev.filter((r) => r.berkasId === l.id) }));
}

export async function tambahRevisi(
  berkasId: number,
  items: { lokasi?: string; jenis?: 'wajib' | 'saran'; teks: string }[],
  sumber: Revisi['sumber'],
) {
  const [b] = await db().select().from(berkas).where(eq(berkas.id, berkasId)).limit(1);
  if (!b) throw new Error(`Berkas ${berkasId} tidak ditemukan.`);
  const baru = await db()
    .insert(revisi)
    .values(items.map((i) => ({ berkasId, lokasi: i.lokasi ?? '', jenis: i.jenis ?? 'wajib', teks: i.teks, sumber })))
    .returning();
  if (b.status === 'menunggu') {
    await db().update(berkas).set({ status: 'draf' }).where(eq(berkas.id, berkasId));
  }
  return baru;
}

export async function ubahRevisi(
  id: number,
  patch: Partial<Pick<Revisi, 'lokasi' | 'jenis' | 'teks' | 'status'>>,
) {
  const [r] = await db().update(revisi).set(patch).where(eq(revisi.id, id)).returning();
  if (!r) throw new Error(`Revisi ${id} tidak ditemukan.`);
  return r;
}

export async function setRingkasan(berkasId: number, ringkasan: string) {
  await db().update(berkas).set({ ringkasan }).where(eq(berkas.id, berkasId));
}

export async function kirimRevisi(berkasId: number, keputusan: 'perlu_revisi' | 'disetujui', ringkasan?: string) {
  const [b] = await db().select().from(berkas).where(eq(berkas.id, berkasId)).limit(1);
  if (!b) throw new Error(`Berkas ${berkasId} tidak ditemukan.`);
  const terkirim = await db()
    .update(revisi)
    .set({ status: 'dikirim' })
    .where(and(eq(revisi.berkasId, berkasId), eq(revisi.status, 'draf')))
    .returning({ id: revisi.id });
  await db()
    .update(berkas)
    .set({ status: keputusan, keputusanAt: new Date(), ...(ringkasan !== undefined ? { ringkasan } : {}) })
    .where(eq(berkas.id, berkasId));
  const nama = `${labelJenisPendek(b.jenis)} versi ${b.versi}`;
  await catatAktivitas(
    b.mahasiswaId,
    keputusan === 'disetujui'
      ? `${nama} disetujui dosen pembimbing`
      : `Dosen memberi ${terkirim.length} catatan revisi pada ${nama}`,
    b.id,
  );
  return { terkirim: terkirim.length, status: keputusan };
}

export async function tandaiSelesai(revisiId: number, mahasiswaId: number, selesai: boolean) {
  const [r] = await db()
    .select({ id: revisi.id })
    .from(revisi)
    .innerJoin(berkas, eq(berkas.id, revisi.berkasId))
    .where(and(eq(revisi.id, revisiId), eq(berkas.mahasiswaId, mahasiswaId), eq(revisi.status, 'dikirim')))
    .limit(1);
  if (!r) throw new Error('Revisi tidak ditemukan.');
  await db().update(revisi).set({ selesai }).where(eq(revisi.id, revisiId));
}

export async function revisiTerbukaMahasiswa(mahasiswaId: number) {
  const rows = await db()
    .select({ id: revisi.id })
    .from(revisi)
    .innerJoin(berkas, eq(berkas.id, revisi.berkasId))
    .where(
      and(
        eq(berkas.mahasiswaId, mahasiswaId),
        eq(revisi.status, 'dikirim'),
        eq(revisi.selesai, false),
        ne(berkas.status, 'digantikan'),
      ),
    );
  return rows.length;
}
