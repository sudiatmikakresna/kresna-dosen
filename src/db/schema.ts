import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  role: text('role', { enum: ['mahasiswa', 'dosen'] }).notNull(),
  nim: text('nim').unique(),
  username: text('username').unique(),
  nama: text('nama').notNull(),
  passwordHash: text('password_hash').notNull(),
  judulSkripsi: text('judul_skripsi'),
  driveFolderId: text('drive_folder_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const berkas = pgTable(
  'berkas',
  {
    id: serial('id').primaryKey(),
    mahasiswaId: integer('mahasiswa_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jenis: text('jenis').notNull(),
    versi: integer('versi').notNull(),
    sumber: text('sumber', { enum: ['upload', 'gdocs'] }).notNull(),
    /** Tidak dipakai lagi sejak berkas disimpan di Google Drive. */
    fileUrl: text('file_url'),
    fileName: text('file_name'),
    driveFileId: text('drive_file_id'),
    ukuran: integer('ukuran'),
    gdocsUrl: text('gdocs_url'),
    catatan: text('catatan'),
    teks: text('teks'),
    status: text('status', {
      enum: ['menunggu', 'draf', 'perlu_revisi', 'disetujui', 'digantikan'],
    })
      .notNull()
      .default('menunggu'),
    ringkasan: text('ringkasan'),
    keputusanAt: timestamp('keputusan_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('berkas_mahasiswa_idx').on(t.mahasiswaId)],
);

export const revisi = pgTable(
  'revisi',
  {
    id: serial('id').primaryKey(),
    berkasId: integer('berkas_id')
      .notNull()
      .references(() => berkas.id, { onDelete: 'cascade' }),
    lokasi: text('lokasi').notNull().default(''),
    jenis: text('jenis', { enum: ['wajib', 'saran'] }).notNull().default('wajib'),
    teks: text('teks').notNull(),
    sumber: text('sumber', { enum: ['dosen', 'mcp'] }).notNull().default('dosen'),
    status: text('status', { enum: ['draf', 'dikirim', 'dibuang'] }).notNull().default('draf'),
    selesai: boolean('selesai').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('revisi_berkas_idx').on(t.berkasId)],
);

export const aktivitas = pgTable('aktivitas', {
  id: serial('id').primaryKey(),
  mahasiswaId: integer('mahasiswa_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  berkasId: integer('berkas_id').references(() => berkas.id, { onDelete: 'set null' }),
  teks: text('teks').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mcpTokens = pgTable('mcp_tokens', {
  id: serial('id').primaryKey(),
  dosenId: integer('dosen_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  nama: text('nama').notNull(),
  prefix: text('prefix').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Akun Google Drive dosen tempat semua berkas disimpan. */
export const googleAkun = pgTable('google_akun', {
  id: serial('id').primaryKey(),
  dosenId: integer('dosen_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  rootFolderId: text('root_folder_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Sesi unggah bertahap (resumable) ke Google Drive. */
export const uploadSesi = pgTable('upload_sesi', {
  id: text('id').primaryKey(),
  mahasiswaId: integer('mahasiswa_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jenis: text('jenis').notNull(),
  fileName: text('file_name').notNull(),
  mime: text('mime').notNull(),
  ukuran: integer('ukuran').notNull(),
  uri: text('uri').notNull(),
  driveFileId: text('drive_file_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Berkas = typeof berkas.$inferSelect;
export type Revisi = typeof revisi.$inferSelect;

/** Pengaturan sederhana kunci–nilai, mis. chat ID Telegram dosen. */
export const pengaturan = pgTable('pengaturan', {
  kunci: text('kunci').primaryKey(),
  nilai: text('nilai').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Grup WhatsApp tujuan laporan review. Laporan hanya dikirim ke grup berstatus diizinkan. */
export const waGrup = pgTable('wa_grup', {
  chatId: text('chat_id').primaryKey(),
  nama: text('nama'),
  diizinkan: boolean('diizinkan').notNull().default(false),
  terakhirAt: timestamp('terakhir_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Pesan grup WhatsApp tujuan laporan, disimpan dari webhook WAHA (event message.any, bertanda tangan HMAC).
 * Pesan dari grup lain tidak disimpan. Riwayat tetap ada walaupun WAHA dipindah atau di-reset.
 */
export const waPesan = pgTable(
  'wa_pesan',
  {
    id: serial('id').primaryKey(),
    /** ID pesan dari WAHA, mis. false_1203...@g.us_3EB0..._123@lid. Unik supaya kiriman ulang webhook tidak ganda. */
    messageId: text('message_id').notNull().unique(),
    chatId: text('chat_id').notNull(),
    /** Nama tampilan atau nomor pengirim; null untuk pesan dari nomor bot sendiri. */
    pengirim: text('pengirim'),
    /** ID WhatsApp pengirim apa adanya (@c.us atau @lid). */
    pengirimId: text('pengirim_id'),
    dariSaya: boolean('dari_saya').notNull().default(false),
    teks: text('teks').notNull().default(''),
    lampiran: boolean('lampiran').notNull().default(false),
    /** Asal pesan: webhook (langsung) atau impor (disalin dari riwayat WAHA). */
    sumber: text('sumber', { enum: ['webhook', 'impor'] }).notNull().default('webhook'),
    waktu: timestamp('waktu', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wa_pesan_chat_waktu_idx').on(t.chatId, t.waktu)],
);

export type WaPesan = typeof waPesan.$inferSelect;

/**
 * Klien OAuth hasil Dynamic Client Registration (RFC 7591), mis. connector Claude. Klien CIMD (client_id berupa URL)
 * tidak disimpan di sini; metadatanya dibaca dari URL itu saat otorisasi.
 */
export const oauthKlien = pgTable('oauth_klien', {
  clientId: text('client_id').primaryKey(),
  nama: text('nama'),
  /** Daftar redirect URI, dipisah baris baru. */
  redirectUris: text('redirect_uris').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Kode otorisasi sekali pakai (PKCE S256), berlaku 5 menit. Yang disimpan hanya hash-nya. */
export const oauthKode = pgTable('oauth_kode', {
  kodeHash: text('kode_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  dosenId: integer('dosen_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  scope: text('scope'),
  resource: text('resource'),
  kedaluwarsaAt: timestamp('kedaluwarsa_at', { withTimezone: true }).notNull(),
  dipakaiAt: timestamp('dipakai_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Koneksi OAuth (satu baris per persetujuan): access token 1 jam dan refresh token 90 hari yang dirotasi setiap dipakai.
 * Yang disimpan hanya hash token. Dicabut lewat Panel dosen → Koneksi MCP.
 */
export const oauthToken = pgTable(
  'oauth_token',
  {
    id: serial('id').primaryKey(),
    dosenId: integer('dosen_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    namaKlien: text('nama_klien'),
    scope: text('scope'),
    resource: text('resource'),
    accessHash: text('access_hash').notNull().unique(),
    accessKedaluwarsaAt: timestamp('access_kedaluwarsa_at', { withTimezone: true }).notNull(),
    refreshHash: text('refresh_hash').notNull().unique(),
    refreshKedaluwarsaAt: timestamp('refresh_kedaluwarsa_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oauth_token_dosen_idx').on(t.dosenId)],
);

/**
 * Penilaian agent/dosen: apakah catatan revisi dari bimbingan sebelumnya sudah diperbaiki di versi baru.
 * Dipakai untuk aturan approve: setiap sub bab harus > 70% catatannya diperbaiki.
 */
export const cekPerbaikan = pgTable(
  'cek_perbaikan',
  {
    id: serial('id').primaryKey(),
    berkasId: integer('berkas_id')
      .notNull()
      .references(() => berkas.id, { onDelete: 'cascade' }),
    revisiId: integer('revisi_id')
      .notNull()
      .references(() => revisi.id, { onDelete: 'cascade' }),
    diperbaiki: boolean('diperbaiki').notNull(),
    keterangan: text('keterangan'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cek_perbaikan_berkas_revisi_idx').on(t.berkasId, t.revisiId)],
);

/** Log review otomatis lewat Claude API: kunci agar satu berkas tidak direview ganda, plus pemakaian token. */
export const reviewAi = pgTable(
  'review_ai',
  {
    id: serial('id').primaryKey(),
    berkasId: integer('berkas_id')
      .notNull()
      .references(() => berkas.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['proses', 'dikirim', 'draf', 'dilewati', 'gagal'] }).notNull().default('proses'),
    keputusan: text('keputusan'),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    jumlahCatatan: integer('jumlah_catatan'),
    alasan: text('alasan'),
    durasiMs: integer('durasi_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    selesaiAt: timestamp('selesai_at', { withTimezone: true }),
  },
  (t) => [index('review_ai_berkas_idx').on(t.berkasId, t.createdAt)],
);

export type ReviewAi = typeof reviewAi.$inferSelect;

/** Percobaan login dosen yang gagal, untuk membatasi tebak password (per username dan per IP, jendela 15 menit). */
export const loginGagal = pgTable(
  'login_gagal',
  {
    id: serial('id').primaryKey(),
    username: text('username').notNull(),
    ip: text('ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('login_gagal_username_idx').on(t.username, t.createdAt), index('login_gagal_ip_idx').on(t.ip, t.createdAt)],
);
