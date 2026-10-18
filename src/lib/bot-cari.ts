/**
 * Pencarian potongan dokumen (retrieval) untuk bot WhatsApp bila dokumen aktif terlalu besar untuk dikirim utuh.
 * Dokumen dipotong per paragraf (±1.500 karakter, tumpang tindih sedikit) lalu diberi skor BM25 terhadap kata kunci
 * pertanyaan. Tanpa layanan embedding, jadi tidak ada biaya atau kunci API tambahan.
 */

export type Potongan = { judul: string; bagian: number; teks: string };

const STOP = new Set(
  'yang dan di ke dari untuk pada dengan ini itu atau juga dalam tidak akan ada adalah bisa saya kamu apa bagaimana kapan siapa berapa mana kah lah pun sudah belum harus dapat oleh sebagai karena jika bila maka agar para tentang secara saat lebih tolong mohon pak bu bot'.split(' '),
);

export const kataKunci = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9.]+/g, ' ')
    .split(/\s+/)
    .map((k) => k.replace(/^\.+|\.+$/g, ''))
    .filter((k) => k.length >= 2 && !STOP.has(k));

export function potongDokumen(judul: string, teks: string, ukuran = 1500, tumpang = 200): Potongan[] {
  const paragraf = teks.split(/\n\s*\n/).flatMap((p) => (p.length > ukuran ? p.match(new RegExp(`[\\s\\S]{1,${ukuran}}`, 'g')) ?? [] : [p]));
  const hasil: Potongan[] = [];
  let isi = '';
  for (const p of paragraf) {
    if (isi && isi.length + p.length > ukuran) {
      hasil.push({ judul, bagian: hasil.length + 1, teks: isi.trim() });
      isi = isi.slice(-tumpang);
    }
    isi += (isi ? '\n\n' : '') + p;
  }
  if (isi.trim()) hasil.push({ judul, bagian: hasil.length + 1, teks: isi.trim() });
  return hasil;
}

/** Ambil potongan paling relevan (BM25), maksimal `batasKarakter`, diurutkan kembali sesuai urutan dokumen. */
export function pilihPotongan(dokumen: { judul: string; teks: string }[], kueri: string, batasKarakter = 40_000) {
  const semua = dokumen.flatMap((d) => potongDokumen(d.judul, d.teks));
  const q = [...new Set(kataKunci(kueri))];
  if (semua.length === 0 || q.length === 0) return semua.slice(0, 10);
  const token = semua.map((p) => kataKunci(p.teks));
  const rata = token.reduce((n, t) => n + t.length, 0) / token.length;
  const df = new Map(q.map((k) => [k, token.filter((t) => t.includes(k)).length]));
  const k1 = 1.2;
  const b = 0.75;
  const skor = token.map((t) => {
    const tf = new Map<string, number>();
    for (const k of t) tf.set(k, (tf.get(k) ?? 0) + 1);
    return q.reduce((s, k) => {
      const f = tf.get(k) ?? 0;
      if (!f) return s;
      const idf = Math.log(1 + (semua.length - df.get(k)! + 0.5) / (df.get(k)! + 0.5));
      return s + idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / rata)));
    }, 0);
  });
  const urut = semua.map((p, i) => ({ p, i, s: skor[i] })).filter((x) => x.s > 0).sort((a, z) => z.s - a.s);
  const dipilih: typeof urut = [];
  let total = 0;
  for (const x of urut) {
    if (total + x.p.teks.length > batasKarakter) continue;
    dipilih.push(x);
    total += x.p.teks.length;
  }
  return dipilih.sort((a, z) => a.i - z.i).map((x) => x.p);
}
