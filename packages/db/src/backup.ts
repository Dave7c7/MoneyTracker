/**
 * Backups of the database.
 *
 * One command writes one file: a gzipped SQL dump, made by `pg_dump`, named
 * after the minute it was taken and readable by `psql` and by a person. The
 * dump drops what it recreates (`--clean --if-exists`), so restoring it into
 * the same database replaces the schema rather than colliding with it.
 *
 * The connection travels as environment variables, not as arguments: a
 * password in `argv` is a password in `ps`, for every user on the machine.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

/** A backup that was written. */
export interface BackupFile {
  /** Where it is. */
  path: string;
  /** How big the file is, before it is compressed. */
  bytes: number;
  /** When it was taken, ISO. */
  takenAt: string;
}

/** What a restore did. */
export interface RestoreResult {
  /** How many bytes of SQL were read. */
  bytes: number;
}

/** The pattern of a file this module wrote, and therefore may prune. */
const FILE_PATTERN = /^moneytracker-\d{4}-\d{2}-\d{2}-\d{6}\.sql\.gz$/;

/** The name of a backup, from the moment it was taken. */
export function backupFileName(now: Date = new Date()): string {
  const iso = now.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 19).replace(/:/g, '');
  return `moneytracker-${date}-${time}.sql.gz`;
}

/**
 * Writes a backup and prunes the old ones.
 *
 * @example
 * createBackup({ databaseUrl, directory: 'backups', keep: 14 });
 */
export function createBackup(options: {
  databaseUrl: string;
  directory: string;
  /** How many files to keep, counting the new one. */
  keep?: number;
  now?: Date;
}): BackupFile {
  const { databaseUrl, directory, keep = 14, now = new Date() } = options;
  const database = databaseName(databaseUrl);

  const dump = execFileSync(
    'pg_dump',
    ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--format=plain', database],
    { env: connectionEnv(databaseUrl), maxBuffer: 512 * 1024 * 1024 },
  );

  const text = dump.toString('utf8');
  if (!text.includes('PostgreSQL database dump')) {
    throw new Error(`pg_dump did not produce a database dump for ${database}.`);
  }

  mkdirSync(directory, { recursive: true, mode: 0o700 });

  const path = join(directory, backupFileName(now));
  // A backup is the whole of someone's money: only its owner may read it.
  writeFileSync(path, gzipSync(dump, { level: 9 }), { mode: 0o600 });

  pruneBackups(directory, keep);

  return { path, bytes: dump.byteLength, takenAt: now.toISOString() };
}

/**
 * Restores a backup into a database.
 *
 * `--single-transaction` means a dump that fails halfway leaves the database
 * as it was: a half-restored set of tables is worse than an error.
 *
 * @example
 * restoreBackup({ databaseUrl, file: 'backups/moneytracker-2026-10-23-031500.sql.gz' });
 */
export function restoreBackup(options: { databaseUrl: string; file: string }): RestoreResult {
  const { databaseUrl, file } = options;
  if (!existsSync(file)) throw new Error(`There is no backup at ${file}.`);

  const raw = readFileSync(file);
  const sql = file.endsWith('.gz') ? gunzipSync(raw) : raw;
  if (sql.byteLength === 0) throw new Error(`The backup at ${file} is empty.`);

  execFileSync(
    'psql',
    ['--set', 'ON_ERROR_STOP=1', '--single-transaction', '--quiet', '--no-psqlrc'],
    { env: connectionEnv(databaseUrl), input: sql, maxBuffer: 64 * 1024 * 1024 },
  );

  return { bytes: sql.byteLength };
}

/** The backups in a directory, oldest first. Ignores anything it did not write. */
export function listBackups(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => FILE_PATTERN.test(name))
    .sort()
    .map((name) => join(directory, name));
}

/** Deletes the oldest backups, keeping the newest `keep`. */
export function pruneBackups(directory: string, keep: number): string[] {
  const files = listBackups(directory);
  const excess = files.slice(0, Math.max(0, files.length - Math.max(1, keep)));
  for (const file of excess) unlinkSync(file);
  return excess;
}

/** The name of the database in a connection string. */
function databaseName(databaseUrl: string): string {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name) throw new Error('The database address does not name a database.');
  return name;
}

/**
 * libpq's environment, from a connection string.
 *
 * The password is here and not in the arguments on purpose.
 */
function connectionEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.PGHOST = url.hostname;
  env.PGPORT = url.port || '5432';
  env.PGUSER = decodeURIComponent(url.username);
  env.PGPASSWORD = decodeURIComponent(url.password);
  env.PGDATABASE = databaseName(databaseUrl);
  // A service file would quietly point at another database.
  delete env.PGSERVICE;
  return env;
}
