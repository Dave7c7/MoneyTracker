/**
 * Turns two-factor off from the command line.
 *
 * The way back in when the phone and the recovery codes are both gone. The
 * person with a shell on the server can already read the ledger, so this hands
 * them nothing new; it saves an install from becoming a brick. Every session is
 * signed out, because the point of the command is that the second factor was
 * lost, and a session should not outlive that.
 *
 *   pnpm db:disable-2fa
 */

import { getLocalUser } from './queries.ts';
import { signOutEverywhere } from './auth.ts';
import { createDatabase } from './client.ts';
import { loadDotEnv, loadEnv } from './env.ts';
import { disableTwoFactor, getTwoFactorStatus } from './two-factor.ts';

loadDotEnv();
const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

try {
  const user = await getLocalUser(db);
  if (!user) throw new Error('There is no user in this database yet. Run pnpm db:seed first.');

  const before = await getTwoFactorStatus(db, user.id);
  if (!before.enabled && !before.pending) {
    console.log(`Two-factor is already off for ${user.email}.`);
  } else {
    await disableTwoFactor(db, user.id);
    await signOutEverywhere(db, user.id);
    console.log(
      `Two-factor is off for ${user.email}. The secret and the recovery codes are gone, ` +
        'and every session was signed out.',
    );
  }
} finally {
  await pool.end();
}
