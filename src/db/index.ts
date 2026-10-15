import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { MIGRATION_SQL } from './migrate';
import * as schema from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<any, typeof schema>;

const g = globalThis as unknown as { __countersignDb?: Promise<DB> };

async function open(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import('postgres')).default;
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const client = postgres(url, { max: 5, onnotice: () => {} });
    await client.unsafe(MIGRATION_SQL);
    return drizzle(client, { schema }) as unknown as DB;
  }
  // No DATABASE_URL: embedded Postgres (PGlite) on local disk. Good for
  // development and small single-process installs.
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  let client;
  if (dir === 'memory') client = new PGlite();
  else {
    mkdirSync(dirname(dir), { recursive: true });
    client = new PGlite(dir);
  }
  await client.exec(MIGRATION_SQL);
  return drizzle(client, { schema }) as unknown as DB;
}

export function db(): Promise<DB> {
  return (g.__countersignDb ??= open());
}

export { schema };
