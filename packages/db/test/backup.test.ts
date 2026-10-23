/**
 * Integration tests for backup and restore.
 *
 * They run `pg_dump` and `psql` against the scratch database, and they are
 * skipped when those tools are not installed — the point of the test is the
 * round trip, which needs both.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { count, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { backupFileName, createBackup, listBackups, pruneBackups, restoreBackup } from '../src/backup.ts';
import { ensureDefaultCategories, ensureLocalUser } from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import { categories, users } from '../src/schema.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasPostgresTools =
  spawnSync('pg_dump', ['--version']).status === 0 && spawnSync('psql', ['--version']).status === 0;

describe.skipIf(!testDatabaseUrl || !hasPostgresTools)('backups', () => {
  let db: Database;
  let close: () => Promise<void>;
  let directory: string;

  beforeAll(() => {
    const created = createDatabase(testDatabaseUrl!, { max: 2 });
    db = created.db;
    close = () => created.pool.end();
    directory = mkdtempSync(join(tmpdir(), 'moneytracker-backup-'));
  });

  afterAll(async () => {
    await close();
    rmSync(directory, { recursive: true, force: true });
  });

  afterEach(async () => {
    for (const file of listBackups(directory)) rmSync(file);
  });

  /** A user and the categories that ship with the app, so a dump has content. */
  async function seedSomething() {
    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    await ensureDefaultCategories(db, user.id);
  }

  it('names the file after the minute it was taken', () => {
    expect(backupFileName(new Date('2026-10-23T03:15:09.512Z'))).toBe(
      'moneytracker-2026-10-23-031509.sql.gz',
    );
  });

  it('writes a gzipped dump with the schema in it', async () => {
    await db.execute(sql`truncate table categories, users restart identity cascade`);
    await seedSomething();

    const file = createBackup({
      databaseUrl: testDatabaseUrl!,
      directory,
      now: new Date('2026-10-23T03:15:00.000Z'),
    });

    expect(file.path).toBe(join(directory, 'moneytracker-2026-10-23-031500.sql.gz'));
    expect(existsSync(file.path)).toBe(true);

    const dump = gunzipSync(readFileSync(file.path)).toString('utf8');
    expect(dump).toContain('PostgreSQL database dump');
    expect(dump).toContain('CREATE TABLE');
    // The connection string, password included, is never part of a dump.
    expect(dump).not.toContain('moneytracker:moneytracker');
  });

  it('keeps the newest files and forgets the rest', () => {
    const moment = (hour: number) =>
      createBackup({
        databaseUrl: testDatabaseUrl!,
        directory,
        keep: 2,
        now: new Date(`2026-10-23T0${hour}:00:00.000Z`),
      });

    moment(1);
    moment(2);
    moment(3);

    const kept = listBackups(directory);
    expect(kept).toHaveLength(2);
    expect(kept[0]).toContain('020000');
    expect(kept[1]).toContain('030000');
  });

  it('prunes only the files it wrote', () => {
    // Something else in the folder is not ours to delete.
    const stranger = join(directory, 'holiday-photo.sql.gz');
    const moment = (hour: number) =>
      createBackup({
        databaseUrl: testDatabaseUrl!,
        directory,
        keep: 5,
        now: new Date(`2026-10-23T0${hour}:00:00.000Z`),
      });

    moment(1);
    moment(2);
    writeFileSync(stranger, 'not a backup');

    pruneBackups(directory, 1);

    expect(existsSync(stranger)).toBe(true);
    expect(listBackups(directory)).toHaveLength(1);
  });

  it('restores a backup into the database it came from', async () => {
    await db.execute(sql`truncate table categories, users restart identity cascade`);
    await seedSomething();

    const file = createBackup({ databaseUrl: testDatabaseUrl!, directory });

    // Empty the database the way a disaster would.
    await db.execute(sql`truncate table categories, users restart identity cascade`);
    expect(await countRows('users')).toBe(0);

    const result = restoreBackup({ databaseUrl: testDatabaseUrl!, file: file.path });

    expect(result.bytes).toBeGreaterThan(0);
    expect(await countRows('users')).toBe(1);
    expect(await countRows('categories')).toBeGreaterThan(0);
  });

  /** The rows in one of the two tables these tests care about. */
  async function countRows(table: 'users' | 'categories'): Promise<number> {
    const rows =
      table === 'users'
        ? await db.select({ value: count() }).from(users)
        : await db.select({ value: count() }).from(categories);
    return rows[0]?.value ?? 0;
  }
});
