# WAHA lokal (engine GOWS)

Prasyarat: Docker Desktop (Windows/macOS) atau Docker Engine + Compose (Linux).

```bash
cd waha
# 1. Buat file .env berisi API key dan login dashboard (sekali saja)
docker run --rm -v "$(pwd)":/app/env devlikeapro/waha init-waha /app/env
# 2. Jalankan
docker compose up -d
docker compose logs -f waha   # tekan Ctrl+C untuk keluar dari log
```

Buka http://localhost:3000/dashboard, login dengan `WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD`
dari `.env`, isi API key dengan `WAHA_API_KEY`, lalu **Start** session `default` dan scan QR dari
WhatsApp di HP (Perangkat tertaut → Tautkan perangkat).

- Swagger/API: http://localhost:3000/ (header `X-Api-Key: <WAHA_API_KEY>`).
- Hentikan: `docker compose down`. Perbarui: `docker compose pull && docker compose up -d`.
- `.env` dan folder `sessions/` berisi kredensial dan login WhatsApp: jangan di-commit.
- Image `gows` dibuat untuk CPU x86/amd64. Di Mac Apple Silicon (M1/M2/M3), cek tag ARM di
  https://waha.devlike.pro/docs/how-to/engines/ sebelum menjalankan.
