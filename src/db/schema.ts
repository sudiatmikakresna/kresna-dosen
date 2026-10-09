import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  role: text('role', { enum: ['mahasiswa', 'dosen'] }).notNull(),
  nim: text('nim').unique(),
  username: text('username').unique(),
  nama: text('nama').notNull(),
  passwordHash: text('password_hash').notNull(),
  judulSkripsi: text('judul_skripsi'),
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
    fileUrl: text('file_url'),
    fileName: text('file_name'),
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

export type User = typeof users.$inferSelect;
export type Berkas = typeof berkas.$inferSelect;
export type Revisi = typeof revisi.$inferSelect;
