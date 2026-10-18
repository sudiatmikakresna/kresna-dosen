import Link from 'next/link';
import { asc, desc, eq } from 'drizzle-orm';
import { botDokumen, botTanya, db, waGrup } from '@/db';
import { aturDokumenBot, aturModelBot, aturNomorBot, aturSumberGrup, hapusDokumenBot } from '@/app/dosen/actions';
import { FormDokumen } from './FormDokumen';
import { SubmitButton } from '@/components/SubmitButton';
import { waktu } from '@/lib/labels';
import { AMBANG_RETRIEVAL, BATAS_KARAKTER_DOKUMEN, SUMBER_BOT, biayaBulanIni, botSiap, nomorIzinBot, pengaturanBot, sumberDari } from '@/lib/bot-wa';
import { MODEL_BOT_PILIHAN, biayaUsd } from '@/lib/harga-claude';
import { webhookSiap } from '@/lib/wa-pesan';
import { bengkelSiap } from '@/lib/bengkel';
import { spkSiap } from '@/lib/spk';

export const metadata = { title: 'Bot tanya-jawab WhatsApp' };

const STATUS: Record<string, [string, string]> = {
  diproses: ['Diproses', 'text-bg-secondary'],
  dijawab: ['Dijawab', 'text-bg-success'],
  di_luar_topik: ['Di luar dokumen', 'text-bg-warning'],
  dibatasi: ['Dibatasi', 'text-bg-light border'],
  gagal: ['Gagal', 'text-bg-danger'],
};

export default async function BotPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [dokumen, grup, log] = await Promise.all([
    db().select({ id: botDokumen.id, judul: botDokumen.judul, namaFile: botDokumen.namaFile, aktif: botDokumen.aktif, createdAt: botDokumen.createdAt, teks: botDokumen.teks }).from(botDokumen).orderBy(asc(botDokumen.id)),
    db().select().from(waGrup).where(eq(waGrup.botAktif, true)),
    db().select().from(botTanya).orderBy(desc(botTanya.createdAt)).limit(40),
  ]);
  const [nomorIzin, setelan, terpakai] = await Promise.all([nomorIzinBot(), pengaturanBot(), biayaBulanIni()]);
  const totalAktif = dokumen.filter((d) => d.aktif).reduce((n, d) => n + d.teks.length, 0);
  const namaGrup = new Map(grup.map((g) => [g.chatId, g.nama ?? g.chatId]));
  const biaya = (t: typeof botTanya.$inferSelect) => biayaUsd(t.model, { input: t.inputTokens, output: t.outputTokens, cacheRead: t.cacheReadTokens });

  return (
    <>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item"><Link href="/dosen/whatsapp">WhatsApp</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Bot tanya-jawab</li>
        </ol>
      </nav>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1">
        <h1 className="h3 mb-0">Bot tanya-jawab WhatsApp</h1>
        <Link href="/dosen/whatsapp/bot/uji" className="btn btn-sm btn-outline-primary">Uji bot tanpa WhatsApp →</Link>
      </div>
      <p className="text-body-secondary small mb-4">
        Di grup yang bot-nya aktif, anggota bisa menyebut (mention) nomor WhatsApp ini atau membalas pesan bot untuk bertanya. Claude ({MODEL_BOT_PILIHAN[setelan.model].nama})
        menjawab <strong>hanya berdasarkan dokumen aktif di bawah dan data riwayat bimbingan</strong> (progres semua mahasiswa: bab, versi,
        tanggal, keputusan, jumlah catatan, progres perbaikan; tanpa isi catatan dan NIM), lalu menyebut sumbernya. Pertanyaan di luar
        itu dijawab dengan penolakan sopan. Maksimal 5 pertanyaan per orang per 10 menit dan 100 per grup per hari.
      </p>
      {ok === 'dokumen' && <div className="alert alert-success">Dokumen ditambahkan dan langsung dipakai bot.</div>}
      {ok === 'nomor' && <div className="alert alert-success">Daftar nomor yang boleh memakai bot disimpan.</div>}
      {ok === 'sumber' && <div className="alert alert-success">Sumber bot untuk grup itu disimpan.</div>}
      {ok === 'model' && <div className="alert alert-success">Model dan batas biaya disimpan.</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card mb-4">
            <div className="card-header fw-semibold">Status</div>
            <ul className="list-group list-group-flush small">
              <li className="list-group-item"><span className={`badge me-2 ${botSiap() ? 'text-bg-success' : 'text-bg-danger'}`}>{botSiap() ? 'OK' : 'Belum'}</span><code>ANTHROPIC_API_KEY</code></li>
              <li className="list-group-item"><span className={`badge me-2 ${webhookSiap() ? 'text-bg-success' : 'text-bg-danger'}`}>{webhookSiap() ? 'OK' : 'Belum'}</span>Webhook WAHA (<code>WAHA_WEBHOOK_HMAC_KEY</code>)</li>
              <li className="list-group-item">
                <span className={`badge me-2 ${spkSiap() ? 'text-bg-success' : 'text-bg-secondary'}`}>{spkSiap() ? 'OK' : 'Opsional'}</span>
                Data kelas SPK dari idea-spk (<code>SPK_TURSO_DATABASE_URL</code>, <code>SPK_TURSO_AUTH_TOKEN</code> read-only)
              </li>
              <li className="list-group-item">
                <span className={`badge me-2 ${bengkelSiap() ? 'text-bg-success' : 'text-bg-secondary'}`}>{bengkelSiap() ? 'OK' : 'Opsional'}</span>
                Poin dan progres Bengkel Pemrograman Mobile (<code>BENGKEL_DATABASE_URL</code>, Neon schema <code>bengkel</code>, read-only)
              </li>
              <li className="list-group-item">
                <span className={`badge me-2 ${grup.length ? 'text-bg-success' : 'text-bg-warning'}`}>{grup.length}</span>
                grup dengan bot aktif{grup.length ? `: ${grup.map((g) => g.nama ?? g.chatId).join(', ')}` : ''}.{' '}
                <Link href="/dosen/whatsapp">Atur di halaman WhatsApp</Link>
              </li>
              <li className="list-group-item">
                <span className={`badge me-2 ${totalAktif ? 'text-bg-success' : 'text-bg-warning'}`}>{dokumen.filter((d) => d.aktif).length}</span>
                dokumen aktif, {totalAktif.toLocaleString('id-ID')} dari {BATAS_KARAKTER_DOKUMEN.toLocaleString('id-ID')} karakter
                (±{Math.round(totalAktif / 4).toLocaleString('id-ID')} token)
                {totalAktif > AMBANG_RETRIEVAL && <> · dokumen besar: bot mencari potongan yang relevan, bukan mengirim semuanya</>}
              </li>
              <li className="list-group-item">
                <span className={`badge me-2 ${setelan.batasBiaya > 0 && terpakai >= setelan.batasBiaya ? 'text-bg-danger' : setelan.batasBiaya > 0 && terpakai >= setelan.batasBiaya * 0.8 ? 'text-bg-warning' : 'text-bg-success'}`}>
                  ${terpakai.toFixed(2)}
                </span>
                perkiraan biaya bulan ini{setelan.batasBiaya > 0 ? ` dari batas $${setelan.batasBiaya}` : ' (tanpa batas)'}
              </li>
            </ul>
          </div>

          <div className="card mb-4">
            <div className="card-header fw-semibold">Siapa yang boleh bertanya</div>
            <div className="card-body small">
              <p className="mb-2">
                {nomorIzin.length ? (
                  <>Hanya <strong>{nomorIzin.length} nomor</strong> di bawah yang dilayani bot. Mention dari nomor lain diabaikan tanpa balasan (tercatat sebagai &quot;Dibatasi&quot;).</>
                ) : (
                  <>Semua anggota grup yang bot-nya aktif boleh bertanya.</>
                )}
              </p>
              <form action={aturNomorBot}>
                <label htmlFor="nomor" className="form-label">Nomor WhatsApp, pisahkan dengan koma atau baris baru (kosongkan untuk semua anggota)</label>
                <textarea id="nomor" name="nomor" rows={3} className="form-control form-control-sm font-monospace mb-2" defaultValue={nomorIzin.join('\n')} placeholder="081234567890" />
                <SubmitButton className="btn btn-sm btn-primary">Simpan nomor</SubmitButton>
              </form>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header fw-semibold">Model &amp; batas biaya</div>
            <div className="card-body small">
              <form action={aturModelBot}>
                <label htmlFor="model" className="form-label">Model Claude</label>
                <select id="model" name="model" className="form-select form-select-sm mb-2" defaultValue={setelan.model}>
                  {Object.entries(MODEL_BOT_PILIHAN).map(([id, m]) => (
                    <option key={id} value={id}>
                      {m.nama} · {m.keterangan} (${m.input}/${m.output} per 1 juta token)
                    </option>
                  ))}
                </select>
                <label htmlFor="batas" className="form-label">Batas biaya per bulan (USD, 0 = tanpa batas)</label>
                <input id="batas" name="batas" type="number" min={0} step="0.5" className="form-control form-control-sm mb-2" defaultValue={setelan.batasBiaya} />
                <p className="text-body-secondary mb-2">
                  Bila batas tercapai, bot membalas &quot;kuota habis&quot; sampai bulan berikutnya. Telegram memberi tahu di 80% dan 100%.
                </p>
                <SubmitButton className="btn btn-sm btn-primary">Simpan</SubmitButton>
              </form>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header fw-semibold">Sumber per grup</div>
            {grup.length === 0 ? (
              <div className="card-body small text-body-secondary">Belum ada grup dengan bot aktif.</div>
            ) : (
              <ul className="list-group list-group-flush small">
                {grup.map((g) => {
                  const aktif = sumberDari(g.botSumber);
                  return (
                    <li key={g.chatId} className="list-group-item">
                      <form action={aturSumberGrup.bind(null, g.chatId)}>
                        <div className="fw-semibold mb-1">
                          {g.nama ?? g.chatId}
                          {g.botSumber == null && <span className="badge text-bg-warning ms-2">semua sumber (belum diatur)</span>}
                        </div>
                        {SUMBER_BOT.map((x) => (
                          <div className="form-check" key={x.id}>
                            <input className="form-check-input" type="checkbox" id={`${g.chatId}-${x.id}`} name={`sumber_${x.id}`} defaultChecked={aktif.has(x.id)} />
                            <label className="form-check-label" htmlFor={`${g.chatId}-${x.id}`}>{x.label}</label>
                          </div>
                        ))}
                        <SubmitButton className="btn btn-sm btn-outline-primary mt-2">Simpan sumber grup ini</SubmitButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="card-footer small text-body-secondary">
              Bot hanya memakai sumber yang dicentang di grup itu. Pertanyaan tentang sumber lain ditolak, mis. grup kelas SPK tidak bisa menanyakan progres skripsi.
            </div>
          </div>

          <div className="card">
            <div className="card-header fw-semibold">Tambah dokumen</div>
            <div className="card-body">
              <FormDokumen batasKarakter={BATAS_KARAKTER_DOKUMEN} />
              <p className="small text-body-secondary mt-2 mb-0">Jangan masukkan data pribadi mahasiswa: isi dokumen bisa dikutip bot di grup.</p>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card mb-4">
            <div className="card-header fw-semibold">Dokumen</div>
            {dokumen.length === 0 ? (
              <div className="card-body small text-body-secondary">Belum ada dokumen. Tanpa dokumen, bot hanya bisa menjawab pertanyaan riwayat bimbingan.</div>
            ) : (
              <ul className="list-group list-group-flush">
                {dokumen.map((d) => (
                  <li key={d.id} className="list-group-item d-flex flex-wrap align-items-center gap-2">
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{d.judul}</div>
                      <div className="small text-body-secondary">
                        {d.namaFile ?? 'teks ditempel'} · {d.teks.length.toLocaleString('id-ID')} karakter · {waktu(d.createdAt)}
                      </div>
                    </div>
                    <span className={`badge ${d.aktif ? 'text-bg-success' : 'text-bg-secondary'}`}>{d.aktif ? 'Aktif' : 'Nonaktif'}</span>
                    <form action={aturDokumenBot.bind(null, d.id, !d.aktif)}>
                      <SubmitButton className="btn btn-sm btn-outline-secondary">{d.aktif ? 'Nonaktifkan' : 'Aktifkan'}</SubmitButton>
                    </form>
                    <form action={hapusDokumenBot.bind(null, d.id)}>
                      <button className="btn btn-sm btn-outline-danger">Hapus</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-header fw-semibold">Pertanyaan terbaru</div>
            {log.length === 0 ? (
              <div className="card-body small text-body-secondary">Belum ada pertanyaan.</div>
            ) : (
              <ul className="list-group list-group-flush small">
                {log.map((t) => {
                  const [label, cls] = STATUS[t.status] ?? [t.status, 'text-bg-secondary'];
                  return (
                    <li key={t.id} className="list-group-item">
                      <div className="d-flex flex-wrap justify-content-between gap-2">
                        <span>
                          <strong>{t.pengirim ?? 'Anggota grup'}</strong> · {namaGrup.get(t.chatId) ?? t.chatId}
                        </span>
                        <span className="text-body-secondary">
                          {waktu(t.createdAt)}
                          {t.inputTokens != null && <> · ${biaya(t).toFixed(3)}</>}
                        </span>
                      </div>
                      <div className="mt-1">❓ {t.pertanyaan}</div>
                      {t.jawaban && <div className="mt-1 text-body-secondary" style={{ whiteSpace: 'pre-wrap' }}>💬 {t.jawaban}</div>}
                      <div className="mt-1">
                        <span className={`badge ${cls}`}>{label}</span>
                        {t.alasan && <span className="text-body-secondary ms-2">{t.alasan}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
