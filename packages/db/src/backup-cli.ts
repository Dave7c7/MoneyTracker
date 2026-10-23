/**
 * The backup and restore commands.
 *
 *   pnpm db:backup                 # write a backup, keep the newest 14
 *   pnpm db:backup --keep 30       # keep more
 *   pnpm db:backup --out /mnt/usb  # somewhere else
 *   pnpm db:backups                # what is there
 *   pnpm db:restore <file> --yes   # put one back, replacing what is there
 *
 * Restore asks for `--yes` because it drops and recreates every table in the
 * database it points at. The README has the whole story, including the
 * container version.
 */

import { loadDotEnv, loadEnv } from './env.ts';
import { createBackup, restoreBackup, listBackups } from './backup.ts';

loadDotEnv();
const env = loadEnv();

const [, , command, ...args] = process.argv;

try {
  if (command === 'create') {
    const file = createBackup({
      databaseUrl: env.DATABASE_URL,
      directory: flag(args, '--out') ?? process.env.BACKUP_DIR ?? 'backups',
      keep: Number(flag(args, '--keep') ?? process.env.BACKUP_KEEP ?? 14),
    });
    const megabytes = (file.bytes / (1024 * 1024)).toFixed(1);
    console.log(`Backup written: ${file.path}`);
    console.log(`  ${megabytes} MB of SQL, from ${databaseOf(env.DATABASE_URL)}`);
    console.log(`  keep the file somewhere that is not this machine, too.`);
  } else if (command === 'restore') {
    const file = args.find((arg) => !arg.startsWith('-'));
    if (!file) fail('Name the backup to restore: pnpm db:restore <file> --yes');

    if (!args.includes('--yes')) {
      fail(
        `This would replace everything in ${databaseOf(env.DATABASE_URL)} with ${file}.\n` +
          'Stop the app first, then run it again with --yes.',
      );
    }

    const result = restoreBackup({ databaseUrl: env.DATABASE_URL, file });
    console.log(`Restored ${file} into ${databaseOf(env.DATABASE_URL)}.`);
    console.log(`  ${(result.bytes / (1024 * 1024)).toFixed(1)} MB of SQL.`);
  } else if (command === 'list') {
    const files = listBackups(process.env.BACKUP_DIR ?? flag(args, '--out') ?? 'backups');
    if (files.length === 0) console.log('No backups yet. Run: pnpm db:backup');
    for (const file of files) console.log(file);
  } else {
    fail('Usage: pnpm db:backup | pnpm db:backups | pnpm db:restore <file> --yes');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

/** The database a connection string names, for a line a person reads. */
function databaseOf(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, '') || '(unknown)';
  } catch {
    return '(unknown)';
  }
}

/** The value after a flag, if it is there. */
function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/** Says what went wrong, and stops with a failing exit code. */
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
