/**
 * Prepares the end-to-end database.
 *
 * The end-to-end tests change data, so they run against their own scratch
 * database, reset before every run.
 */
import { execFileSync } from 'node:child_process';

export default function globalSetup() {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    // Without a dedicated database the tests run against the development one.
    return;
  }

  execFileSync('pnpm', ['db:reset'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
