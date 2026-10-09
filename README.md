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

Catatan dari MCP berstatus draf dan diberi label **via MCP** di halaman tinjau. Mahasiswa baru melihatnya setelah dikirim.

### Review otomatis: `/review-skripsi`

Skill Claude Code di `.claude/skills/review-skripsi/` mereview semua berkas di antrian review lewat MCP
`bimbingan`, menulis catatan revisi, lalu langsung mengirimkannya ke mahasiswa.

- Jalankan `/review-skripsi` di Claude Code dari folder repo ini. Argumen opsional: NIM, nama, ID berkas,
  atau instruksi fokus, mis. `/review-skripsi 2301020053` atau `/review-skripsi fokus konsistensi istilah`.
- Agar bisa dipakai dari folder mana pun, salin foldernya ke `~/.claude/skills/review-skripsi/`.
- Pengaman: hanya berjalan saat diketik, tidak pernah menyetujui bab secara otomatis (berkas yang tampak
  layak disetujui disimpan sebagai draf untuk keputusan dosen), dan melewati berkas yang sudah punya draf.
- Revisi versi sebelumnya dicek ulang; yang belum diperbaiki ditulis lagi sebagai catatan wajib.

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
- Token MCP disimpan dalam bentuk hash dan bisa dicabut kapan saja dari halaman Koneksi MCP.
