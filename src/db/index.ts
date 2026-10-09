import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { attachDatabasePool } from '@vercel/functions';
import * as schema from './schema';

let instance: NodePgDatabase<typeof schema> | undefined;

export function db() {
  if (!instance) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL belum diatur. Hubungkan database Neon ke project.');
    const pool = new Pool({ connectionString: url, max: 5 });
    attachDatabasePool(pool);
    instance = drizzle(pool, { schema });
  }
  return instance;
}

export * from './schema';
