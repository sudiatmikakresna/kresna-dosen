# Bimbingan Skripsi

Sistem bimbingan skripsi untuk dosen pembimbing:

- Mahasiswa **daftar dengan NIM, nama, dan password**, lalu masuk ke dashboard.
- Mahasiswa **mengunggah berkas** per bab (PDF/DOCX hingga 20 MB), **dokumen lainnya** seperti lampiran dan data hasil penelitian (PDF, DOCX, XLSX, PPTX, CSV, ZIP, PNG/JPG), atau **mengirim link Google Docs**. Setiap kiriman menjadi versi baru dan **disimpan di Google Drive dosen**.
- Mahasiswa membuka berkas untuk melihat **pratinjau dan revisi dari dosen**, lalu menandai revisi yang sudah diperbaiki.
- Dosen menelusuri **kemajuan dan riwayat** setiap mahasiswa, meninjau berkas, dan mengirim revisi.
- **Server MCP** di `/api/mcp` supaya agent (mis. Claude) bisa membaca berkas dan menambahkan catatan revisi sebagai draf.

Stack: Next.js (App Router) · Bootstrap 5 dengan tema Primakara · Neon Postgres (Drizzle ORM) · Google Drive API · `mcp-handler`.

## Deploy ke Vercel

1. Import repo ini sebagai project Vercel.
2. **Storage → Create Database → Neon**, hubungkan ke project. Ini mengisi `DATABASE_URL`.
3. Siapkan OAuth Google (lihat bagian berikut), lalu tambahkan environment variable:
   - `SESSION_SECRET`: string acak minimal 32 karakter (juga dipakai mengenkripsi token Google)
   - `SETUP_KEY`: kunci untuk membuat akun dosen pertama kali
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `APP_URL`: alamat produksi, mis. `https://kresna-dosen.vercel.app`
   - `GOOGLE_HD` (opsional): `primakara.ac.id`
4. Redeploy. Migrasi database berjalan otomatis saat build (`scripts/migrate.mjs`).
5. Buka `/dosen/setup`, masukkan `SETUP_KEY`, lalu buat akun dosen (hanya sekali).
6. Di panel dosen buka **Google Drive → Hubungkan Google Drive**, login dengan akun kampus.
7. Bagikan alamat `/daftar` ke mahasiswa.

## OAuth Google Drive

1. [Google Cloud Console](https://console.cloud.google.com/) → buat project (login dengan akun kampus).
2. **APIs & Services → Library → Google Drive API → Enable**.
3. **OAuth consent screen**: pilih **Internal** (hanya akun @primakara.ac.id, tanpa verifikasi Google). Jika Internal tidak tersedia, pilih External lalu **Publish app** supaya refresh token tidak kedaluwarsa setelah 7 hari.
   Tambahkan scope `.../auth/drive.file`, `openid`, `email`.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: `https://<domain-produksi>/api/google/callback`.
5. Salin Client ID dan Client secret ke environment variable Vercel.

Izin `drive.file` berarti aplikasi hanya bisa mengakses file yang dibuatnya sendiri. Jika admin Google Workspace kampus membatasi aplikasi pihak ketiga, minta admin mengizinkan OAuth client ini (Admin console → Security → API controls).

### Penyimpanan dan pratinjau

- Unggahan dipotong 2 MB di browser lalu diteruskan server ke sesi *resumable upload* Google Drive, sehingga melewati batas body 4,5 MB fungsi Vercel. Ukuran maksimal 20 MB.
- Struktur folder: `Bimbingan Skripsi / NIM - Nama / Bab 2 - v1 - berkas.pdf`.
- Dosen melihat pratinjau langsung dari Google Drive. Mahasiswa melihat pratinjau lewat server aplikasi (PDF sampai 4 MB), jadi Drive dosen tidak perlu dibagikan.

## Menghubungkan MCP

1. Masuk sebagai dosen → **Koneksi MCP** → **Buat token baru**. Salin token (hanya ditampilkan sekali).
2. Claude Code:

   ```bash
   claude mcp add --transport http bimbingan https://<domain>/api/mcp \
     --header "Authorization: Bearer <token>"
   ```

   Atau pakai `.mcp.json` di repo ini (server `bimbingan`, sudah diaktifkan lewat `.claude/settings.json`):
   cukup isi environment variable `BIMBINGAN_MCP_TOKEN` dengan token tadi. Di sesi cloud claude.ai/code,
   tambahkan variabel itu di pengaturan environment (menu environment → Edit), lalu buka sesi baru.

Tool yang tersedia:

| Tool | Fungsi |
|---|---|
| `daftar_mahasiswa` | Mahasiswa bimbingan, kemajuan per tahap, berkas terakhir |
| `antrian_review` | Berkas yang menunggu review |
| `baca_berkas` | Metadata, isi teks berkas (per halaman), link Google Drive, revisi versi sebelumnya |
| `riwayat_mahasiswa` | Semua berkas dan aktivitas satu mahasiswa |
| `tambah_revisi` | Tambah catatan revisi sebagai **draf** |
| `ubah_revisi` | Ubah teks/lokasi/jenis, atau buang catatan |
| `set_ringkasan` | Isi ringkasan untuk mahasiswa |
| `kirim_revisi` | Kirim draf ke mahasiswa dengan keputusan `perlu_revisi`/`disetujui` |
| `kirim_laporan_telegram` | Kirim laporan teks ke Telegram dosen (mis. ringkasan review harian) |

Catatan dari MCP berstatus draf dan diberi label **via MCP** di halaman tinjau. Mahasiswa baru melihatnya setelah dikirim.

### Review otomatis: `/review-skripsi`

Skill Claude Code di `.claude/skills/review-skripsi/` mereview semua berkas di antrian review lewat MCP
`bimbingan`, menulis catatan revisi, lalu langsung mengirimkannya ke mahasiswa.

- Jalankan `/review-skripsi` di Claude Code dari folder repo ini. Argumen opsional: NIM, nama, ID berkas,
  atau instruksi fokus, mis. `/review-skripsi 2301020053` atau `/review-skripsi fokus konsistensi istilah`.
- Agar bisa dipakai dari folder mana pun, salin foldernya ke `~/.claude/skills/review-skripsi/`.
- Aturan approve per bab: pengecekan ke-1 dikirim dengan keputusan *perlu revisi*. Mulai pengecekan ke-2,
  agent menilai setiap catatan dari maksimal 2 bimbingan terakhir (tool `nilai_perbaikan`): sudah diperbaiki
  atau belum. Bab *disetujui* hanya bila **setiap sub bab** lebih dari 70% catatannya diperbaiki; selain itu
  *perlu revisi*. Server menolak `disetujui` lewat MCP yang tidak memenuhi aturan ini. Sub bab diambil dari
  nomor di awal lokasi catatan (mis. "1.2"). Draf lengkap dan Dokumen lainnya tidak disetujui otomatis.
  Dosen tetap bisa menyetujui manual dari web.
- Melewati berkas yang sudah punya draf dan berkas tanpa teks.
- Dijalankan otomatis setiap pagi lewat Routine Claude Code; `.claude/settings.json` mengizinkan tool MCP
  `bimbingan` supaya sesi terjadwal tidak tertahan menunggu persetujuan.
- Revisi versi sebelumnya dicek ulang; yang belum diperbaiki ditulis lagi sebagai catatan wajib.

## Connector Claude chat (OAuth): WhatsApp, Bimbingan, dan SISKA

Tiga server MCP bisa dipasang sebagai **custom connector** di Claude chat (claude.ai, Desktop, mobile) tanpa token:

| Connector | URL | Isi |
| --- | --- | --- |
| WhatsApp (WAHA) | `https://kresna-dosen.vercel.app/api/waha/mcp` | `status_whatsapp`, `daftar_chat`, `daftar_grup`, `baca_pesan`, `riwayat_grup_tersimpan`, `cek_nomor`, `kirim_pesan`, `tandai_dibaca` |
| Bimbingan Skripsi | `https://kresna-dosen.vercel.app/api/mcp` | tool review di atas |
| SISKA (presensi kuliah) | `https://kresna-dosen.vercel.app/api/siska/mcp` | `daftar_kelas`, `jadwal_mengajar`, `detail_kelas`, `lihat_presensi`, `mulai_pertemuan`, `ubah_presensi`, `tutup_presensi` |

Pasang: Claude → **Customize → Connectors → Add → Custom → Web** → isi nama dan URL → **Add** → **Connect**.
Claude membuka `/oauth/izin`; masuk sebagai dosen lalu klik **Izinkan**. Koneksi aktif terlihat dan bisa dicabut di
**Panel dosen → Koneksi MCP**.

Connector SISKA memakai `SISKA_COOKIE` (cookie `remember_web_…` akun dosen, sama dengan aplikasi absensi-siska) di
environment Vercel; client SISKA ada di `src/lib/siska/`. `ubah_presensi` dan `tutup_presensi` mengubah data SISKA
atas nama dosen, jadi biarkan pada **Needs approval**.

Cara kerjanya (aplikasi menjadi server otorisasi OAuth 2.1 sendiri, tanpa layanan luar):

- Discovery: `401` + `WWW-Authenticate: Bearer resource_metadata=…` →
  `/.well-known/oauth-protected-resource/api/waha/mcp` (atau `/api/mcp`, `/api/siska/mcp`) → `/.well-known/oauth-authorization-server`.
- Klien: Client ID Metadata Document dari claude.ai/claude.com, atau Dynamic Client Registration di `/api/oauth/register`.
  Hanya redirect `https://claude.ai/…`, `https://claude.com/…`, dan loopback Claude Code yang diterima.
- Authorization code + PKCE S256 (`/oauth/izin`), token di `/api/oauth/token` (form-urlencoded). Access token 1 jam,
  refresh token 90 hari yang dirotasi setiap dipakai. Token terikat ke server MCP yang disetujui (parameter `resource`).
  Database hanya menyimpan hash token (`oauth_klien`, `oauth_kode`, `oauth_token`).
- Token panel `bmb_…` tetap berlaku untuk Claude Code lewat header `Authorization` (`.mcp.json`).
- `kirim_pesan` mengirim atas nama nomor WhatsApp dosen. Biarkan tool itu pada **Needs approval** di pengaturan connector.
- Keamanan: hanya ada satu akun dosen (setup sekali), jadi hanya dosen itu yang bisa mengizinkan connector. Login dosen
  dikunci 15 menit setelah 8 percobaan gagal (per username dan per IP). Setiap login dosen, penguncian, dan connector
  baru dikirim sebagai peringatan ke Telegram dosen. Token panel `bmb_…` tidak berlaku di server WhatsApp dan SISKA;
  keduanya hanya lewat OAuth. Halaman aplikasi tidak bisa disisipkan (iframe) di situs lain.

## Notifikasi Telegram

Setiap berkas baru (upload atau link Google Docs) dikirim ke Telegram dosen: nama, NIM, jenis dan versi,
catatan mahasiswa, serta tautan ke halaman tinjau dan file di Google Drive.

1. Buat bot lewat **@BotFather** (`/newbot`), salin tokennya ke env `TELEGRAM_BOT_TOKEN`, lalu redeploy.
2. Buka bot di Telegram dan tekan **Start**.
3. Panel dosen → **Telegram** → **Deteksi chat Telegram**. Chat ID disimpan di database, tidak perlu redeploy.

Bot juga mengirim pesan setiap kali revisi dikirim ke mahasiswa (dari web atau MCP), berisi keputusan dan
jumlah catatan, serta laporan ringkas di akhir review harian otomatis.

Notifikasi dikirim di latar belakang (`waitUntil`), jadi unggahan tidak melambat dan tetap berhasil bila
Telegram sedang gangguan. Tautan "Tinjau di aplikasi" memakai `APP_URL`.

## Review otomatis lewat Claude API

Setiap berkas baru direview otomatis oleh aplikasi sendiri (`src/lib/review-ai.ts`) 10 menit setelah diunggah, tanpa
cron dan tanpa sesi Claude Code:

- Setelah unggahan tersimpan, `simpanBerkasBaru` menjadwalkan pesan Upstash QStash tertunda 10 menit
  (`REVIEW_JEDA_MENIT`) ke `/api/review/[id]`. Endpoint memverifikasi tanda tangan QStash, langsung membalas 202,
  dan menjalankan review di latar dengan batas waktu 5 menit. Bila mahasiswa mengunggah versi baru dalam jeda itu,
  versi lama sudah berstatus digantikan dan dilewati, jadi hanya versi terakhir yang direview.
- PDF asli diunduh dari Google Drive dan dikirim ke Claude (`claude-opus-5-5`, effort `high`, structured output).
  Berkas non-PDF memakai teks hasil ekstraksi.
- Catatan, penilaian perbaikan, aturan approve 70% per sub bab, kirim ke mahasiswa, notifikasi Telegram, dan pengumuman
  grup WhatsApp memakai kode yang sama dengan jalur MCP. Berkas yang dilewati, gagal, atau perlu keputusan dosen
  diberitahukan lewat Telegram.
- **Panel dosen → Review Otomatis** menampilkan riwayat, token, dan perkiraan biaya, plus tombol untuk mereview ulang
  semua berkas di antrian (mis. yang masuk sebelum API key diatur).
- Environment variable Vercel: `ANTHROPIC_API_KEY`, `APP_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
  `QSTASH_NEXT_SIGNING_KEY` (otomatis lewat integrasi Upstash di Vercel Marketplace), opsional `REVIEW_JEDA_MENIT`
  dan `REVIEW_EFFORT`.
- `/review-skripsi` di Claude Code tetap bisa dipakai untuk review manual.

## Laporan ke grup WhatsApp

Setiap kali `/review-skripsi` (atau Routine review harian) mengirim revisi, ringkasannya diumumkan ke grup
WhatsApp mahasiswa lewat tool MCP `kirim_laporan_whatsapp`: nama, bab dan versi, serta keputusan. NIM dan isi catatan
tidak dikirim ke grup. Bot tidak menjawab pesan grup, tetapi pesan grup tujuan dicatat (lihat di bawah).

- WhatsApp terhubung lewat WAHA (engine GOWS) di VPS: `https://waha.kresna.blog`, session `default`. Tidak ada WAHA
  lokal lagi; konfigurasi Docker WAHA dikelola di VPS.
- Environment variable Vercel: `WAHA_URL` (`https://waha.kresna.blog`), `WAHA_API_KEY`, `WAHA_WEBHOOK_HMAC_KEY`, dan
  `WAHA_SESSION` (opsional, default `default`).
- Pilih grup tujuan di **Panel dosen → WhatsApp**. Bila WAHA tidak terjangkau atau sesi logout, pengumuman gagal
  dan statusnya tercantum di laporan Telegram.

### Riwayat pesan grup (webhook WAHA)

```
WAHA (VPS) ──POST event message.any + X-Webhook-Hmac (HMAC-SHA512)──► /api/whatsapp/webhook ──► tabel wa_pesan
```

- WAHA mengirim setiap pesan ke `https://kresna-dosen.vercel.app/api/whatsapp/webhook`. Endpoint menolak permintaan
  tanpa tanda tangan HMAC yang cocok (401).
- Hanya pesan dari grup **tujuan laporan** yang disimpan. Pesan dari grup lain (mis. grup kelas) dan chat pribadi
  dibalas 200 tanpa disimpan. Kiriman ulang dengan ID pesan yang sama tidak membuat baris ganda.
- **Panel dosen → WhatsApp → Lihat riwayat** membaca tabel `wa_pesan`, jadi riwayat tetap ada walaupun WAHA dipindah
  atau di-reset. Tombol **Salin dari WAHA** di halaman itu menyalin pesan lama yang masih ada di WAHA (aman diulang).
- Event `message.any` dipakai (bukan hanya `message`) supaya laporan bot dan pesan yang Anda kirim dari HP ikut tercatat.
- Environment variable Vercel: `WAHA_WEBHOOK_HMAC_KEY`, nilainya sama dengan `WHATSAPP_HOOK_HMAC_KEY` di WAHA.

Konfigurasi webhook di WAHA (VPS: `/opt/waha/.env.secrets`), lalu recreate container
(`docker compose up -d --force-recreate waha`):

```
WHATSAPP_HOOK_URL=https://kresna-dosen.vercel.app/api/whatsapp/webhook
WHATSAPP_HOOK_EVENTS=message.any
WHATSAPP_HOOK_HMAC_KEY=<kunci acak, openssl rand -hex 32>
WHATSAPP_HOOK_RETRIES_POLICY=exponential
WHATSAPP_HOOK_RETRIES_DELAY_SECONDS=5
WHATSAPP_HOOK_RETRIES_ATTEMPTS=6
```

Cek: kirim pesan di grup tujuan, lalu buka **Panel dosen → WhatsApp → Lihat riwayat**. Permintaan tanpa tanda tangan
yang benar dibalas `401` (`curl -i -X POST https://kresna-dosen.vercel.app/api/whatsapp/webhook -d '{}'`). Webhook
global ini berlaku untuk semua session dan tidak tampil di `GET /api/sessions`. Bila WAHA dipindah ke server lain,
cukup salin baris-baris di atas; riwayat lama tetap ada di database aplikasi.

### Bot tanya-jawab di grup (RAG dari dokumen dosen)

```
pesan grup ──webhook WAHA (HMAC)──► bot di-mention / pesan bot dibalas? grup bot aktif?
          ──► Claude API (dokumen aktif + citations, prompt caching; tool riwayat bimbingan) ──► balasan (reply) ke penanya
```

- Aktifkan per grup di **Panel dosen → WhatsApp → Aktifkan bot**. Grup lain diabaikan. Saklar ini terpisah dari
  "Jadikan tujuan" (laporan review).
- Unggah dokumen rujukan (PDF, DOCX, TXT, MD sampai 100 MB, atau tempel teks; teks diekstrak di browser sehingga file besar tidak terkena batas body Vercel, dan PDF hasil scan ditolak) di **WhatsApp → Dokumen & log bot
  tanya-jawab** (`/dosen/whatsapp/bot`). Teks disimpan di tabel `bot_dokumen`; dokumen bisa dinonaktifkan tanpa dihapus.
- Bot menjawab **hanya dari dokumen aktif dan data riwayat bimbingan**, lalu menyebut sumbernya. Bila jawabannya tidak
  ada di keduanya, bot membalas penolakan tetap dan menyarankan bertanya ke dosen, tanpa menebak.
- Riwayat bimbingan dibaca lewat tool (`src/lib/bot-riwayat.ts`): `riwayat_bimbingan` (satu mahasiswa, cari nama) dan
  `progres_semua_mahasiswa` (rekap semua). Semua anggota grup boleh menanyakan progres mahasiswa mana pun, tetapi datanya
  ringkas seperti laporan grup: bab, versi, tanggal unggah/tanggapan, status, jumlah catatan, dan progres perbaikan per
  sub bab. Isi catatan revisi, NIM, dan isi berkas tidak pernah dikirim ke Claude.
- Pemicu: mention nomor bot (`@nomor`) atau membalas pesan bot. Pesan tanpa mention tidak dikirim ke Claude.
- Data kelas SPK (opsional): tool `data_kelas_spk` (`src/lib/spk.ts`) membaca database Turso aplikasi
  [idea-spk](https://idea-spk.vercel.app): ide studi kasus per NIM, algoritma pilihan, dan link tugas. Hanya `SELECT`;
  datanya sama dengan yang tampil publik di situs itu. Aktif bila `SPK_TURSO_DATABASE_URL` diatur. Buat token read-only:
  `turso db tokens create <nama-db> --read-only`, lalu isi `SPK_TURSO_DATABASE_URL` (libsql://…, sama dengan
  `TURSO_DATABASE_URL` di project idea-spk) dan `SPK_TURSO_AUTH_TOKEN` di environment variable Vercel kresna-dosen.
- Data Bengkel Pemrograman Mobile (opsional): tool `poin_kelas_bengkel`, `status_mahasiswa_bengkel`, dan
  `aktivitas_kelas_bengkel` (`src/lib/bengkel.ts`) membaca salinan database Bengkel Flutter (kresna.blog) di Neon,
  schema `bengkel`, yang disinkron tiap ±5 menit oleh `npm run sinkron-neon` di server Bengkel. Aturan poin: soal D1/D2
  yang lulus = 2, D3 = 5, dihitung per tanggal sebelum 22.00 WITA, target 10. Kelas dikenali dari ID grup WhatsApp
  (tabel `bengkel.kelas`), jadi di grup kelas pertanyaan tidak perlu menyebut kelasnya. Aktif bila
  `BENGKEL_DATABASE_URL` diatur; pakai role Neon yang hanya punya hak `SELECT` pada schema `bengkel`.
- Data SISKA (baca saja): tool `jadwal_mengajar_siska`, `presensi_siska`, dan `rekap_ketidakhadiran_siska`
  (`src/lib/bot-siska.ts`) memakai klien SISKA yang sama dengan konektor MCP SISKA (`SISKA_COOKIE`). Kelas dikenali dari
  nama grup berpola `HARI-DOSEN-Mata Kuliah-PRODI-KELAS-JAM` (mis. `KAM-IBK-Pemrograman Mobile-SI-PAGI1-13.00`), jadi
  berlaku juga untuk grup SPK. Bot tidak pernah mengubah presensi atau memulai/menutup sesi. Aktif bila `SISKA_COOKIE`
  diatur; bila cookie kedaluwarsa, tool SISKA gagal dan bot menjawab bahwa data sedang tidak bisa dibaca.
- Absensi SISKA lewat bot, dengan konfirmasi (`src/lib/bot-aksi.ts`, tabel `bot_aksi`): dosen menulis mis.
  `@bot absen hadir Rifqi, Dodi izin`. Claude hanya memanggil `rencana_ubah_presensi_siska` atau `rencana_mulai_sesi_siska`;
  kode mencocokkan kelas, pertemuan, dan nama/NIM peserta, lalu menyimpan rencana dan mengirim ringkasannya. Dosen
  membalas pesan itu dengan **ya** (atau **batal**) dalam 10 menit; yang dijalankan persis isi rencana, sekali, tanpa
  Claude. Nama yang ambigu atau tidak ditemukan membuat rencana tidak dibuat. Hanya aktif bila daftar nomor yang
  diizinkan diisi, dan konfirmasi harus dari nomor yang sama. Menutup presensi (Alfa massal) dan mengakhiri sesi
  sengaja tidak tersedia lewat bot.
- Siapa yang boleh bertanya diatur di halaman bot (**Siapa yang boleh bertanya**, kunci `wa_bot_nomor_izin` di tabel
  `pengaturan`; awalnya hanya 081934374633). Pengirim dicocokkan lewat nomor maupun LID-nya (diambil dari WAHA).
  Mention dari nomor lain diabaikan tanpa balasan dan tercatat "Dibatasi". Kosongkan daftar untuk mengizinkan semua.
- Memory percakapan (short-term, sliding window): setiap pertanyaan membawa maksimal 6 tanya-jawab terakhir dari
  penanya yang sama di grup yang sama dalam 60 menit terakhir (dibaca dari `bot_tanya`), sehingga pertanyaan lanjutan
  seperti "kalau Bab 4?" atau "yang tadi" dipahami. Bila penanya me-reply sebuah pesan, teks pesan itu ikut dikirim.
  Penanya bisa mengirim "mulai baru" untuk mengosongkan konteks. Log bot mencatat berapa tanya-jawab yang dipakai.
- Batas: 5 pertanyaan per orang per 10 menit dan 100 per grup per hari. Webhook ulangan untuk pesan yang sama tidak
  menghasilkan jawaban ganda.
- Semua pertanyaan, jawaban, status, dan pemakaian token tercatat di tabel `bot_tanya` dan tampil di halaman bot.
- Environment variable: `ANTHROPIC_API_KEY` dan `WAHA_WEBHOOK_HMAC_KEY` (keduanya sudah dipakai fitur lain). Isi dokumen
  dikirim ke Claude setiap pertanyaan dan di-cache 1 jam, jadi pertanyaan berikutnya dalam jam yang sama jauh lebih murah.

## Google Docs

Mahasiswa harus mengatur berbagi ke *"Siapa saja yang memiliki link – Pelihat"*. Saat dikirim, sistem menyimpan **salinan PDF ke Google Drive dosen** dan teks dokumen sebagai versi tersebut, jadi revisi tidak bergeser walaupun dokumen asli terus diedit. Pratinjau menampilkan dokumen langsung, dengan tautan ke salinan PDF.

## Pengembangan lokal

```bash
cp .env.example .env.local   # isi DATABASE_URL, SESSION_SECRET, SETUP_KEY
npm install
npm run db:migrate
npm run dev
```

Mengubah skema: edit `src/db/schema.ts`, lalu `npm run db:generate` untuk membuat file migrasi baru di `drizzle/`.

## Catatan keamanan

- Berkas disimpan di Google Drive dosen dan tidak dibagikan ke siapa pun. Mahasiswa hanya bisa membuka berkasnya sendiri lewat aplikasi.
- Refresh token Google disimpan terenkripsi (AES-256-GCM, kunci diturunkan dari `SESSION_SECRET`). Mengganti `SESSION_SECRET` berarti Google Drive harus dihubungkan ulang.
- Siapa saja bisa mendaftar sebagai mahasiswa dengan NIM. Dosen melihat semua mahasiswa yang terdaftar.
- Token MCP dan token OAuth connector disimpan dalam bentuk hash dan bisa dicabut kapan saja dari halaman Koneksi MCP.
