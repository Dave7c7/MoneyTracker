/**
 * Database client.
 *
 * A single pooled connection is shared by the app. Queries are always
 * parameterized: Drizzle builds prepared statements, never string-concatenated
 * SQL.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.ts';

export type Schema = typeof schema;
export type Database = ReturnType<typeof createDatabase>['db'];

/**
 * Creates a pooled database client.
 *
 * @example
 * const { db, pool } = createDatabase(process.env.DATABASE_URL);
 */
export function createDatabase(databaseUrl: string, options: { max?: number } = {}) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: options.max ?? 10,
    // Fail fast instead of queueing forever when Postgres is unreachable.
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
