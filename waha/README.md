# WAHA (engine GOWS)

> **Produksi saat ini:** WAHA berjalan di VPS `https://waha.kresna.blog` (session `default`). Aplikasi memakainya lewat
> `WAHA_URL` dan `WAHA_API_KEY` di Vercel. Panduan di bawah untuk menjalankan WAHA sendiri, mis. di laptop untuk
> pengujian atau sebagai cadangan.

WAHA berjalan di laptop Anda. Cloudflare Tunnel membuka WAHA ke internet supaya aplikasi di Vercel bisa
mengirim laporan hasil `/review-skripsi` ke grup WhatsApp (lewat API `sendText`), dan WAHA mengirim pesan grup
ke aplikasi lewat webhook.

```
/review-skripsi ──► kresna-dosen.vercel.app ──► Cloudflare Tunnel ──► WAHA (laptop) ──► Grup WA
```

Prasyarat: Docker Desktop (Windows/macOS) atau Docker Engine + Compose (Linux).

## 1. Jalankan WAHA dan tautkan WhatsApp

```bash
cd waha
# Buat file .env berisi API key dan login dashboard (sekali saja)
docker run --rm -v "$(pwd)":/app/env devlikeapro/waha init-waha /app/env
docker compose up -d
```

Buka http://localhost:3000/dashboard, login dengan `WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD`
dari `.env`, isi API key dengan `WAHA_API_KEY`, lalu **Start** session `default` dan scan QR dari
WhatsApp di HP (Perangkat tertaut → Tautkan perangkat). Sebaiknya pakai nomor khusus bot, bukan nomor pribadi.

## 2. Buat Cloudflare Tunnel

**Pilihan A: tunnel tetap (disarankan, butuh domain yang DNS-nya di Cloudflare)**

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → **Create a tunnel** → Cloudflared → beri nama `waha`.
2. Salin token dari perintah instalasi (bagian setelah `--token`) ke `waha/.env`:
   `CLOUDFLARE_TUNNEL_TOKEN=eyJ...`
3. Tab **Public Hostname** → Add: subdomain `waha`, domain Anda, Service `HTTP` → `waha:3000`.
4. Jalankan: `docker compose --profile tunnel up -d`

Alamat WAHA: `https://waha.<domain-anda>`.

**Pilihan B: tunnel cepat (tanpa domain, untuk mencoba)**

```bash
docker compose --profile quick up -d
docker compose logs quick-tunnel | grep trycloudflare
```

Alamat `https://xxxx.trycloudflare.com` **berganti setiap kali tunnel restart**, jadi `WAHA_URL` di Vercel
harus diperbarui lagi. Pakai pilihan A untuk pemakaian sehari-hari.

## 3. Hubungkan ke aplikasi

1. Di Vercel → Settings → Environment Variables (Production), lalu Redeploy:
   - `WAHA_URL` = alamat tunnel, mis. `https://waha.domain-anda.com`
   - `WAHA_API_KEY` = nilai `WAHA_API_KEY` dari `waha/.env`
2. Masukkan nomor bot ke grup bimbingan.
3. Buka **Panel dosen → WhatsApp**, klik **Jadikan tujuan** pada grup itu, lalu **Kirim pesan tes ke grup**.

Setelah itu setiap `/review-skripsi` dan review harian otomatis mengumumkan hasilnya ke grup.

## Webhook pesan grup (riwayat di database)

Supaya pesan grup tujuan tersimpan di aplikasi, WAHA mengirim event pesan ke aplikasi dengan tanda tangan HMAC.
Tambahkan ke env WAHA (di VPS: `/opt/waha/.env.secrets`, di laptop: `waha/.env`), lalu recreate container
(`docker compose up -d --force-recreate waha`):

```
WHATSAPP_HOOK_URL=https://kresna-dosen.vercel.app/api/whatsapp/webhook
WHATSAPP_HOOK_EVENTS=message.any
WHATSAPP_HOOK_HMAC_KEY=<kunci acak, openssl rand -hex 32>
WHATSAPP_HOOK_RETRIES_POLICY=exponential
WHATSAPP_HOOK_RETRIES_DELAY_SECONDS=5
WHATSAPP_HOOK_RETRIES_ATTEMPTS=6
```

Isi kunci yang sama ke Vercel sebagai `WAHA_WEBHOOK_HMAC_KEY` (Production), lalu Redeploy. Aplikasi memverifikasi
header `X-Webhook-Hmac` (HMAC-SHA512 atas body mentah) dan hanya menyimpan pesan dari grup tujuan laporan.

Cek: kirim pesan di grup tujuan, lalu buka **Panel dosen → WhatsApp → Lihat riwayat**. Permintaan tanpa tanda
tangan yang benar dibalas `401`:

```bash
curl -i -X POST https://kresna-dosen.vercel.app/api/whatsapp/webhook -d '{}'
```

Webhook global ini berlaku untuk semua session dan tidak tampil di `GET /api/sessions`. Bila WAHA dipindah ke server
lain, cukup salin baris-baris di atas; riwayat lama tetap ada di database aplikasi.

## Memakai tunnel yang sama untuk aplikasi lain (mis. server bengkel)

Satu tunnel bisa membuka beberapa aplikasi; tidak perlu token baru.

1. Jalankan aplikasinya di laptop dan catat port-nya, mis. server bengkel di port `8080`.
   Pastikan aplikasi mendengarkan di `0.0.0.0` (atau semua interface), bukan hanya `127.0.0.1`,
   supaya bisa dijangkau dari container `cloudflared`.
2. Cloudflare dashboard → Zero Trust → Networks → Tunnels → tunnel `waha` → **Public Hostname** → Add:
   - subdomain `bengkel`, domain Anda
   - Service `HTTP` → `host.docker.internal:8080`
     (jika aplikasinya service di `docker-compose.yml` ini, pakai `<nama-service>:<port>`)
3. Tidak perlu restart: hostname baru langsung aktif. Cek dengan `curl https://bengkel.<domain-anda>/`.

Tunnel cepat (`--profile quick`) hanya membuka satu alamat yang berganti tiap restart, jadi tidak cocok untuk
alamat yang ditulis permanen, seperti `BENGKEL_URL` di repo tugas mahasiswa.

## Catatan

- Tunnel membuat dashboard dan API WAHA bisa diakses dari internet. Semua permintaan API tetap wajib
  `X-Api-Key`, dan dashboard memakai login dari `.env`; jangan bagikan isi `.env`.
- Laporan hanya terkirim selama laptop menyala dan WAHA + tunnel aktif. Bila gagal, statusnya tercantum di laporan Telegram.
- Hentikan: `docker compose --profile tunnel down`. Perbarui: `docker compose pull && docker compose up -d`.
- `.env` dan folder `sessions/` berisi kredensial dan login WhatsApp: jangan di-commit.
- Image `gows` dibuat untuk CPU x86/amd64. Di Mac Apple Silicon (M1/M2/M3), tambahkan `WAHA_IMAGE_TAG=gows-arm`
  ke `waha/.env` sebelum menjalankan.
- Bila port 3000 di laptop sudah dipakai aplikasi lain, tambahkan mis. `WAHA_HOST_PORT=3010` ke `waha/.env`.
  Dashboard lalu ada di http://localhost:3010/dashboard.
- Bila laptop sudah punya tunnel `cloudflared` sendiri (di luar Docker), profile `tunnel` tidak perlu dipakai.
  Tambahkan hostname WAHA ke `ingress` tunnel itu dengan service `http://localhost:<WAHA_HOST_PORT>`,
  lalu jalankan `docker compose up -d` saja.
