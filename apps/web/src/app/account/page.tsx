import {
  getAccount,
  getTwoFactorStatus,
  listAccounts,
  listSessions,
  sessionIdForToken,
} from '@moneytracker/db';

import { AccountSettings } from '@/components/account-settings.tsx';
import { Card } from '@/components/card.tsx';
import { ExportForm } from '@/components/export-form.tsx';
import { TwoFactor } from '@/components/two-factor.tsx';
import { getSessionToken, requireUser } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Account' };

/**
 * The account behind the password.
 *
 * The address you sign in with, the password, two-factor, and where you are
 * signed in.
 * There is no email to send a reset link with, so the password is changed here
 * — or with `pnpm db:set-password` on the server.
 */
export default async function AccountPage() {
  const userId = await requireUser();
  const { db } = getDatabase();
  const env = getEnv();

  const account = await getAccount(db, userId);
  const twoFactor = await getTwoFactorStatus(db, userId);
  const sessions = await listSessions(db, userId);
  const accounts = await listAccounts(db, userId);
  const token = await getSessionToken();
  const currentId = token ? await sessionIdForToken(db, token) : null;

  const format = (date: Date) =>
    new Intl.DateTimeFormat(env.DEFAULT_LOCALE, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: env.APP_TIMEZONE,
    }).format(date);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Account</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {sessions.length} {sessions.length === 1 ? 'machine' : 'machines'}
        </span>
      </div>

      <Card
        title="Signing in"
        subtitle="The address you sign in with, the password, and the machines that are signed in."
      >
        <AccountSettings
          email={account?.email ?? ''}
          lastLoginAt={account?.lastLoginAt ? format(account.lastLoginAt) : null}
          sessions={sessions
            .map((session) => ({
              id: session.id,
              lastSeenAt: format(session.lastSeenAt),
              createdAt: format(session.createdAt),
              userAgent: session.userAgent,
              current: session.id === currentId,
            }))
            .sort((a, b) => Number(b.current) - Number(a.current))}
        />
      </Card>

      <Card
        title="Two-factor sign-in"
        subtitle="A code from an authenticator app, asked for after the password."
      >
        <TwoFactor
          status={{
            enabled: twoFactor.enabled,
            enabledAt: twoFactor.enabledAt ? format(twoFactor.enabledAt) : null,
            pending: twoFactor.pending,
            recoveryCodesLeft: twoFactor.recoveryCodesLeft,
          }}
        />
      </Card>

      <Card
        title="Your data"
        subtitle="Download the transactions, or a copy of the accounts and categories with them."
      >
        <ExportForm accounts={accounts.map((row) => ({ id: row.id, name: row.name }))} />
        <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          The download holds this account&apos;s transactions. For a full backup of the database —
          rules, connections and settings included — run <code>pnpm db:backup</code> on the server;
          the README has the restore steps.
        </p>
      </Card>
    </div>
  );
}
