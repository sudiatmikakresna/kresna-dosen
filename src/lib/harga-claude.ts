/**
 * Harga Claude per 1 juta token (USD) untuk perkiraan biaya di panel. Sumber: dokumentasi model Claude
 * (Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0,10/$0,50 untuk prompt ≤100 ribu token). Tagihan resmi ada di
 * platform.claude.com. Cache read Haiku 5.5 tidak tercantum; dipakai 10% harga input sebagai perkiraan.
 */
export const MODEL_BOT_PILIHAN = {
  'claude-opus-5-5': { nama: 'Opus 5.5', keterangan: 'paling pintar, paling mahal', input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { nama: 'Sonnet 5.5', keterangan: 'seimbang, ±separuh biaya Opus', input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { nama: 'Haiku 5.5', keterangan: 'paling murah dan cepat, kurang teliti', input: 0.1, output: 0.5, cacheRead: 0.01 },
} as const;

export type ModelBot = keyof typeof MODEL_BOT_PILIHAN;
export const MODEL_BOT_BAWAAN: ModelBot = 'claude-opus-5-5';

export const modelValid = (m: unknown): m is ModelBot => typeof m === 'string' && m in MODEL_BOT_PILIHAN;

/** Perkiraan biaya (USD). Model tak dikenal dihitung dengan harga Opus 5.5 supaya tidak meremehkan biaya. */
export function biayaUsd(model: string | null | undefined, t: { input?: number | null; output?: number | null; cacheRead?: number | null }) {
  const h = MODEL_BOT_PILIHAN[modelValid(model) ? model : MODEL_BOT_BAWAAN];
  return ((t.input ?? 0) * h.input + (t.output ?? 0) * h.output + (t.cacheRead ?? 0) * h.cacheRead) / 1_000_000;
}
