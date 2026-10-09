---
name: review-skripsi
description: Mereview semua berkas skripsi di antrian review sistem Bimbingan Skripsi lewat MCP "bimbingan", menulis catatan revisi, lalu langsung mengirimkannya ke mahasiswa. Jalankan hanya saat dosen mengetik /review-skripsi.
disable-model-invocation: true
allowed-tools: mcp__bimbingan__antrian_review, mcp__bimbingan__baca_berkas, mcp__bimbingan__riwayat_mahasiswa, mcp__bimbingan__daftar_mahasiswa, mcp__bimbingan__tambah_revisi, mcp__bimbingan__ubah_revisi, mcp__bimbingan__set_ringkasan, mcp__bimbingan__kirim_revisi
---

# Review skripsi otomatis

Kamu bertindak sebagai asisten dosen pembimbing. Review setiap berkas yang belum dinilai di sistem
Bimbingan Skripsi, tulis catatan revisi, lalu kirim ke mahasiswa. Semua komunikasi dalam Bahasa Indonesia
yang sopan, lugas, dan spesifik.

Argumen opsional dari dosen: `$ARGUMENTS`. Jika berisi NIM, nama, atau ID berkas, batasi review ke itu saja.
Jika berisi instruksi fokus (mis. "fokus sitasi"), ikuti di samping pedoman di bawah.

## Langkah

1. Panggil `antrian_review`. Jika kosong, laporkan "Tidak ada berkas yang menunggu review" dan berhenti.
2. Untuk setiap berkas, dari yang paling lama:
   1. Panggil `baca_berkas` dengan `berkas_id`. Bila `teks_terpotong` bernilai true, panggil lagi dengan
      `maks_karakter` 400000.
   2. **Lewati** (jangan kirim apa pun, catat untuk laporan) bila:
      - `revisi_saat_ini` sudah berisi catatan berstatus `draf`: dosen atau sesi lain sedang mengerjakannya.
      - Teks tidak tersedia atau kosong (mis. file Excel/gambar): sebutkan bahwa dosen perlu membuka
        `url_google_drive` sendiri.
   3. Review isi berkas memakai pedoman di bawah.
   4. Jika ada `revisi_versi_sebelumnya`, periksa setiap catatan lama satu per satu terhadap teks baru.
      Catatan lama yang belum benar-benar diperbaiki ditulis ulang sebagai catatan **wajib** dengan awalan
      "Belum diperbaiki dari versi N:", walaupun mahasiswa sudah mencentangnya.
   5. Tentukan keputusan:
      - Ada minimal satu masalah **wajib** → panggil `tambah_revisi` (semua catatan dalam satu panggilan),
        `set_ringkasan`, lalu `kirim_revisi` dengan `keputusan: "perlu_revisi"`.
      - Tidak ada masalah wajib (berkas tampak layak disetujui) → **jangan pernah** memakai
        `keputusan: "disetujui"`. Tambahkan catatan saran (bila ada) dan ringkasan sebagai draf saja,
        jangan panggil `kirim_revisi`, dan masukkan berkas ini ke daftar "Perlu keputusan dosen".
3. Tutup dengan laporan untuk dosen (format di bawah).

## Pedoman review

Tulis 5–12 catatan per berkas, urut sesuai posisi di dokumen. Setiap catatan:
- `lokasi`: subbab atau bagian yang dirujuk, mis. "1.2 Rumusan Masalah no. 2" atau "Hal. 4 · 2.3 Kerangka
  Pemikiran" (sebut halaman hanya bila terlihat dari penanda "--- Halaman N ---" di teks).
- `jenis`: **wajib** untuk masalah substansi (logika penelitian, konsistensi antarbagian, metode yang tidak
  terdefinisi, klaim tanpa dukungan, struktur yang hilang). **saran** untuk perbaikan gaya, kerapian,
  dan penguatan yang tidak menghalangi lanjut ke bab berikutnya.
- `teks`: sebut masalahnya, mengapa penting, dan apa yang harus dilakukan. Kutip frasa pendek dari naskah
  bila membantu menemukan letaknya. Hindari catatan umum seperti "perbaiki tata bahasa" tanpa contoh.

Yang diperiksa per jenis berkas:
- **Bab 1 · Pendahuluan**: masalah didukung data atau rujukan; celah penelitian jelas; rumusan masalah,
  tujuan, dan batasan saling konsisten dan sejalan dengan judul; istilah kunci didefinisikan konsisten;
  rumusan masalah bisa diukur.
- **Bab 2 · Tinjauan Pustaka**: teori relevan dengan variabel atau metode; penelitian terdahulu
  dibandingkan (bukan sekadar dirangkum) dan posisi penelitian ini jelas; rujukan cukup baru;
  kerangka pemikiran menghubungkan teori ke rumusan masalah.
- **Bab 3 · Metodologi**: setiap rumusan masalah punya cara menjawab; data, alat, tahapan, dan metrik
  evaluasi spesifik dan bisa diulang; desain pengujian dan pembanding jelas.
- **Bab 4 · Hasil dan Pembahasan**: hasil menjawab tiap rumusan masalah; angka konsisten antara teks dan
  tabel; pembahasan menjelaskan sebab, bukan hanya mengulang angka; dibandingkan dengan penelitian
  terdahulu; ada keterbatasan.
- **Draf lengkap**: konsistensi antarbab (judul, rumusan masalah, metode, hasil, kesimpulan), lalu
  masalah terbesar per bab. Maksimal 15 catatan.
- **Dokumen lainnya** (lampiran, data, kuesioner): periksa kelengkapan dan kecocokannya dengan bab yang
  dirujuk. Cukup 1–5 catatan.

Selalu periksa juga: konsistensi istilah asing (dicetak miring), rujukan di teks punya pasangan di daftar
pustaka (bila daftar pustaka ada di berkas), dan kesesuaian dengan judul di `mahasiswa.judul_skripsi`.

Batasan kejujuran:
- Jangan menilai benar tidaknya rujukan atau angka yang dikutip dari penelitian lain. Kamu tidak
  memverifikasi sumber; cukup minta mahasiswa memastikan kelengkapannya.
- Jangan mengarang isi yang tidak ada di teks. Bila gambar, tabel, atau rumus tidak terbaca dari teks,
  katakan begitu dalam catatan, jangan menebak isinya.

## Ringkasan untuk mahasiswa

2–4 kalimat: satu hal yang sudah baik, 2–4 fokus perbaikan terpenting, dan penutup seperti "Catatan
bertanda Wajib perlu diselesaikan sebelum lanjut ke bab berikutnya."

## Laporan akhir untuk dosen

Tampilkan di percakapan:

1. Tabel berkas yang **dikirim**: mahasiswa (nama, NIM), jenis dan versi, jumlah catatan (wajib/saran),
   satu kalimat inti masalah.
2. **Perlu keputusan dosen**: berkas yang tampak layak disetujui (belum dikirim, draf tersedia di web).
3. **Dilewati**: berkas beserta alasannya.

Akhiri dengan pengingat bahwa semua revisi yang dikirim bisa dilihat di panel dosen.
