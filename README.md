# Bimbingan Skripsi

Sistem bimbingan skripsi untuk dosen pembimbing:

- Mahasiswa **daftar dengan NIM, nama, dan password**, lalu masuk ke dashboard.
- Mahasiswa **mengunggah berkas** (PDF/DOCX hingga 20 MB) atau **mengirim link Google Docs**. Setiap kiriman menjadi versi baru.
- Mahasiswa membuka berkas untuk melihat **pratinjau dan revisi dari dosen**, lalu menandai revisi yang sudah diperbaiki.
- Dosen menelusuri **kemajuan dan riwayat** setiap mahasiswa, meninjau berkas, dan mengirim revisi.
- **Server MCP** di `/api/mcp` supaya agent (mis. Claude) bisa membaca berkas dan menambahkan catatan revisi sebagai draf.

Stack: Next.js (App Router) · Bootstrap 5 dengan tema Primakara · Neon Postgres (Drizzle ORM) · Vercel Blob · `mcp-handler`.

## Deploy ke Vercel

1. Import repo ini sebagai project Vercel.
2. **Storage → Create Database → Neon**, hubungkan ke project. Ini mengisi `DATABASE_URL`.
3. **Storage → Create → Blob** (akses *public*), hubungkan ke project. Ini mengisi `BLOB_READ_WRITE_TOKEN`.
4. Tambahkan environment variable:
   - `SESSION_SECRET`: string acak minimal 32 karakter
   - `SETUP_KEY`: kunci untuk membuat akun dosen pertama kali
5. Redeploy. Migrasi database berjalan otomatis saat build (`scripts/migrate.mjs`).
6. Buka `/dosen/setup`, masukkan `SETUP_KEY`, lalu buat akun dosen (hanya sekali).
7. Bagikan alamat `/daftar` ke mahasiswa.

## Menghubungkan MCP

1. Masuk sebagai dosen → **Koneksi MCP** → **Buat token baru**. Salin token (hanya ditampilkan sekali).
2. Claude Code:

   ```bash
   claude mcp add --transport http bimbingan https://<domain>/api/mcp \
     --header "Authorization: Bearer <token>"
   ```

Tool yang tersedia:

| Tool | Fungsi |
|---|---|
| `daftar_mahasiswa` | Mahasiswa bimbingan, kemajuan per tahap, berkas terakhir |
| `antrian_review` | Berkas yang menunggu review |
| `baca_berkas` | Metadata, isi teks berkas (per halaman), revisi versi sebelumnya |
| `riwayat_mahasiswa` | Semua berkas dan aktivitas satu mahasiswa |
| `tambah_revisi` | Tambah catatan revisi sebagai **draf** |
| `ubah_revisi` | Ubah teks/lokasi/jenis, atau buang catatan |
| `set_ringkasan` | Isi ringkasan untuk mahasiswa |
| `kirim_revisi` | Kirim draf ke mahasiswa dengan keputusan `perlu_revisi`/`disetujui` |

Catatan dari MCP berstatus draf dan diberi label **via MCP** di halaman tinjau. Mahasiswa baru melihatnya setelah dikirim.

## Google Docs

Mahasiswa harus mengatur berbagi ke *"Siapa saja yang memiliki link – Pelihat"*. Saat dikirim, sistem menyimpan **salinan PDF** dan teks dokumen sebagai versi tersebut, jadi revisi tidak bergeser walaupun dokumen asli terus diedit. Pratinjau menampilkan dokumen langsung, dengan tautan ke salinan PDF.

## Pengembangan lokal

```bash
cp .env.example .env.local   # isi DATABASE_URL, SESSION_SECRET, SETUP_KEY
npm install
npm run db:migrate
npm run dev
```

Mengubah skema: edit `src/db/schema.ts`, lalu `npm run db:generate` untuk membuat file migrasi baru di `drizzle/`.

## Catatan keamanan

- Berkas disimpan di Vercel Blob dengan akses *public* tetapi URL acak yang sulit ditebak. Siapa pun yang memegang URL bisa membuka berkasnya.
- Siapa saja bisa mendaftar sebagai mahasiswa dengan NIM. Dosen melihat semua mahasiswa yang terdaftar.
- Token MCP disimpan dalam bentuk hash dan bisa dicabut kapan saja dari halaman Koneksi MCP.
