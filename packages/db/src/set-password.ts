/**
 * Sets the password of the local user from the command line.
 *
 * There is no email to reset a password with, so this is the way back in when
 * the password is forgotten. It works on the server, which is the only place
 * with the database open, and it signs every session out.
 *
 *   pnpm db:set-password              (asks twice, without echoing)
 *   printf '%s' 'new password' | pnpm db:set-password
 */

import { createInterface } from 'node:readline/promises';

import { getLocalUser } from './queries.ts';
import { setPassword, signOutEverywhere } from './auth.ts';
import { createDatabase } from './client.ts';
import { loadDotEnv, loadEnv } from './env.ts';

loadDotEnv();
const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

try {
  const user = await getLocalUser(db);
  if (!user) throw new Error('There is no user in this database yet. Run pnpm db:seed first.');

  const password = await readPassword();

  await setPassword(db, user.id, password);
  await signOutEverywhere(db, user.id);

  console.log(`The password of ${user.email} is set. Every session was signed out.`);
} finally {
  await pool.end();
}

/**
 * Reads the new password, without echoing it when a person is typing it.
 */
async function readPassword(): Promise<string> {
  // A pipe or a file: take the whole of it, one trailing newline aside.
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const value = Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '');
    if (!value) throw new Error('No password was given on standard input.');
    return value;
  }

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const first = await terminal.question('New password: ');
    const again = await terminal.question('The same password again: ');
    if (first !== again) throw new Error('The two passwords do not match.');
    return first;
  } finally {
    terminal.close();
  }
}
