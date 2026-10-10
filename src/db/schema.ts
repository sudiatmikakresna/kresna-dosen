import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

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

/** Grup WhatsApp yang pernah memanggil bot. Bot hanya menjawab di grup yang diizinkan dosen. */
export const waGrup = pgTable('wa_grup', {
  chatId: text('chat_id').primaryKey(),
  nama: text('nama'),
  diizinkan: boolean('diizinkan').notNull().default(false),
  terakhirAt: timestamp('terakhir_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Log pertanyaan ke bot WhatsApp. messageId unik mencegah jawaban ganda saat WAHA mengulang webhook. */
export const waTanya = pgTable(
  'wa_tanya',
  {
    id: serial('id').primaryKey(),
    messageId: text('message_id').notNull().unique(),
    chatId: text('chat_id').notNull(),
    pengirim: text('pengirim').notNull(),
    namaPengirim: text('nama_pengirim'),
    pertanyaan: text('pertanyaan').notNull(),
    jawaban: text('jawaban'),
    status: text('status', { enum: ['diproses', 'dijawab', 'diabaikan', 'dibatasi', 'gagal'] }).notNull().default('diproses'),
    alasan: text('alasan'),
    perluDosen: boolean('perlu_dosen').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wa_tanya_pengirim_idx').on(t.pengirim, t.createdAt), index('wa_tanya_chat_idx').on(t.chatId, t.createdAt)],
);

export type WaTanya = typeof waTanya.$inferSelect;
