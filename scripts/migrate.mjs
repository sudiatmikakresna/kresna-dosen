// Menjalankan migrasi database sebelum build. Dilewati jika DATABASE_URL belum ada,
// supaya deploy pertama (sebelum Neon terhubung) tetap bisa build.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.warn('[migrate] DATABASE_URL belum diatur, migrasi dilewati.');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  console.log('[migrate] Migrasi database selesai.');
} finally {
  await pool.end();
}
