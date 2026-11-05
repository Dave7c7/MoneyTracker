import { redirect } from 'next/navigation';

import {
  ensureDefaultCategories,
  ensureLocalUser,
  getLocalUser,
  hasPassword,
} from '@moneytracker/db';

import { Card } from '@/components/card.tsx';
import { LoginForm } from '@/components/login-form.tsx';
import { getSessionUserId } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in' };

/**
 * The way in.
 *
 * A fresh install asks for a password to be set; after that it asks for the
 * password that is already set. The app starts closed, so an address on the
 * network reaches a sign-in page and nothing else.
 *
 * A database with no user at all — a fresh container — gets its local user and
 * the default categories here, so the first visit is also the first sign-in.
 */
export default async function LoginPage() {
  // A live session goes to the money. Asking the database, rather than looking
  // for the cookie, keeps a stale cookie from bouncing between here and there.
  if (await getSessionUserId()) redirect('/overview');

  const { db } = getDatabase();
  const env = getEnv();

  let user = await getLocalUser(db);
  if (!user) {
    const created = await ensureLocalUser(db, {
      email: env.DEFAULT_USER_EMAIL,
      displayName: env.DEFAULT_USER_NAME,
      timeZone: env.APP_TIMEZONE,
    });
    await ensureDefaultCategories(db, created.id);
    user = await getLocalUser(db);
  }

  const claimed = user ? await hasPassword(db, user.id) : false;

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-2 md:pt-10">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">
          {claimed ? 'Sign in' : 'Set a password'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {claimed
            ? 'Your money is behind this password. It stays on this server.'
            : 'This app is new. Choose the password that opens it; it never leaves this server.'}
        </p>
      </div>

      <Card
        title={claimed ? 'Your account' : 'The first password'}
        subtitle={
          claimed
            ? 'One password, one person. Sign-in pauses for a few minutes after repeated mistakes.'
            : 'Use something long that you will remember. There is no email to reset it.'
        }
      >
        {user ? (
          <LoginForm mode={claimed ? 'signin' : 'setup'} email={user.email} />
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            There is no user in this database yet. Run <code>pnpm db:seed</code> to create one.
          </p>
        )}
      </Card>
    </div>
  );
}
