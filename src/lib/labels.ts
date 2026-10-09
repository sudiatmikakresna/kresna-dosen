export const JENIS = [
  { id: 'bab1', label: 'Bab 1 · Pendahuluan' },
  { id: 'bab2', label: 'Bab 2 · Tinjauan Pustaka' },
  { id: 'bab3', label: 'Bab 3 · Metodologi' },
  { id: 'bab4', label: 'Bab 4 · Hasil dan Pembahasan' },
  { id: 'draf_lengkap', label: 'Draf lengkap' },
  { id: 'lainnya', label: 'Dokumen lainnya · Lampiran, hasil penelitian, dll.' },
] as const;

/** Jenis berkas yang tiap unggahannya dokumen tersendiri, bukan versi baru dari yang lama. */
export const JENIS_TERPISAH = ['lainnya'];

export const terpisah = (jenis: string) => JENIS_TERPISAH.includes(jenis);

/** Ekstensi yang diterima: bab hanya PDF/DOCX, dokumen lainnya lebih luas. */
export const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export function ekstensiDiizinkan(jenis: string) {
  return terpisah(jenis) ? Object.keys(MIME) : ['pdf', 'docx'];
}

export const TAHAP = ['bab1', 'bab2', 'bab3', 'bab4'] as const;

export function labelJenis(id: string) {
  return JENIS.find((j) => j.id === id)?.label ?? id;
}

export function labelJenisPendek(id: string) {
  return labelJenis(id).split(' · ')[0];
}

export const STATUS: Record<string, { label: string; badge: string; bar: string }> = {
  menunggu: { label: 'Menunggu review', badge: 'text-bg-secondary', bar: 'bg-secondary' },
  draf: { label: 'Sedang direview', badge: 'text-bg-info', bar: 'bg-info' },
  perlu_revisi: { label: 'Perlu revisi', badge: 'text-bg-warning', bar: 'bg-warning' },
  disetujui: { label: 'Disetujui', badge: 'text-bg-success', bar: 'bg-success' },
  digantikan: { label: 'Digantikan', badge: 'text-bg-light border', bar: 'bg-body-secondary' },
  belum: { label: 'Belum diunggah', badge: 'text-bg-light border', bar: 'bg-body-secondary' },
};

export function status(id: string) {
  return STATUS[id] ?? STATUS.belum;
}

const fmtTanggal = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Makassar' });
const fmtWaktu = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar',
});

export function tanggal(d: Date | null | undefined) {
  return d ? fmtTanggal.format(d) : '—';
}

export function waktu(d: Date | null | undefined) {
  return d ? fmtWaktu.format(d) : '—';
}

export function relatif(d: Date | null | undefined) {
  if (!d) return '—';
  const hari = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (hari <= 0) return 'Hari ini';
  if (hari === 1) return 'Kemarin';
  return `${hari} hari lalu`;
}
