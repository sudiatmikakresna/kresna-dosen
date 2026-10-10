# WAHA lokal (engine GOWS) + Cloudflare Tunnel

WAHA berjalan di laptop Anda. Cloudflare Tunnel membuka WAHA ke internet supaya aplikasi di Vercel bisa
menerima pesan grup (webhook) dan mengirim jawaban (API `sendText`).

```
Grup WA ──► WAHA (laptop) ──webhook──► kresna-dosen.vercel.app/api/wa/webhook ──► Claude
                ▲                                                   │
                └──────── Cloudflare Tunnel ◄──── sendText ─────────┘
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

1. Buat rahasia webhook: `openssl rand -hex 32`
2. Tambahkan ke `waha/.env`, lalu `docker compose up -d` (ulangi dengan `--profile` yang Anda pakai):
   ```
   WHATSAPP_HOOK_URL=https://kresna-dosen.vercel.app/api/wa/webhook
   WHATSAPP_HOOK_EVENTS=message
   WHATSAPP_HOOK_HMAC_KEY=<rahasia dari langkah 1>
   ```
3. Di Vercel → Settings → Environment Variables (Production), lalu Redeploy:
   - `WAHA_URL` = alamat tunnel, mis. `https://waha.domain-anda.com`
   - `WAHA_API_KEY` = nilai `WAHA_API_KEY` dari `waha/.env`
   - `WA_WEBHOOK_SECRET` = rahasia dari langkah 1
   - `ANTHROPIC_API_KEY` = API key dari https://platform.claude.com
4. Masukkan nomor bot ke grup bimbingan, kirim `/tanya halo`, lalu buka **Panel dosen → WhatsApp** dan
   klik **Izinkan** pada grup itu.

## Catatan

- Tunnel membuat dashboard dan API WAHA bisa diakses dari internet. Semua permintaan API tetap wajib
  `X-Api-Key`, dan dashboard memakai login dari `.env`; jangan bagikan isi `.env`.
- Bot hanya berjalan selama laptop menyala dan WAHA + tunnel aktif. Pertanyaan saat laptop mati tidak dijawab.
- Hentikan: `docker compose --profile tunnel down`. Perbarui: `docker compose pull && docker compose up -d`.
- `.env` dan folder `sessions/` berisi kredensial dan login WhatsApp: jangan di-commit.
- Image `gows` dibuat untuk CPU x86/amd64. Di Mac Apple Silicon (M1/M2/M3), cek tag ARM di
  https://waha.devlike.pro/docs/how-to/engines/ sebelum menjalankan.
