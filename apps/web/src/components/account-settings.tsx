'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MIN_PASSWORD_LENGTH } from '@moneytracker/core';

/** A session, as the screen lists it. */
export interface SessionSummary {
  id: string;
  lastSeenAt: string;
  createdAt: string;
  userAgent: string | null;
  current: boolean;
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

/** A short, human description of a user agent. */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'An unknown browser';
  if (/iPhone|iPad/i.test(userAgent)) return 'Safari on an iPhone or iPad';
  if (/Android/i.test(userAgent) && /Chrome/i.test(userAgent)) return 'Chrome on Android';
  if (/Firefox/i.test(userAgent)) return 'Firefox';
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/Chrome/i.test(userAgent)) return 'Chrome';
  if (/Safari/i.test(userAgent)) return 'Safari';
  if (/curl|node|undici/i.test(userAgent)) return 'A script';
  return 'A browser';
}

const buttonClass =
  'w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900';

function Feedback({ error, message }: { error: string | null; message: string | null }) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-rose-50 p-2.5 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200"
      >
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p
        role="status"
        className="rounded-xl bg-emerald-50 p-2.5 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
      >
        {message}
      </p>
    );
  }
  return null;
}

/**
 * The account: the address you sign in with, the password, and where you are
 * signed in.
 *
 * Every change asks for the current password. That is what stops a session
 * someone left open from locking the owner out.
 */
export function AccountSettings({
  email,
  lastLoginAt,
  sessions,
}: {
  email: string;
  lastLoginAt: string | null;
  sessions: SessionSummary[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <EmailForm email={email} lastLoginAt={lastLoginAt} onChanged={() => router.refresh()} />
      <PasswordForm onChanged={() => router.refresh()} />
      <Sessions sessions={sessions} onChanged={() => router.refresh()} />
      <SignOut />
    </div>
  );
}

/** The address the app signs in with. */
function EmailForm({
  email,
  lastLoginAt,
  onChanged,
}: {
  email: string;
  lastLoginAt: string | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(email);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const response = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, currentPassword: password }),
      });
      const result = (await response.json()) as { error?: string; email?: string };

      if (!response.ok) {
        setError(result.error ?? 'That did not work.');
      } else {
        setValue(result.email ?? value);
        setPassword('');
        setMessage('The address is set.');
        onChanged();
      }
    } catch {
      setError('The app could not be reached.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          The address you sign in with. It is not used to send anything.
          {lastLoginAt ? ` Last sign-in ${lastLoginAt}.` : ''}
        </p>
      </div>

      <div>
        <label
          htmlFor="email-password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Your current password
        </label>
        <input
          id="email-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </div>

      <Feedback error={error} message={message} />

      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? 'Saving…' : 'Change the address'}
      </button>
    </form>
  );
}

/** The password. */
function PasswordForm({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (next !== confirmation) {
      setError('The two new passwords do not match.');
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? 'That did not work.');
      } else {
        setCurrent('');
        setNext('');
        setConfirmation('');
        setMessage('The password is changed, and the other machines are signed out.');
        onChanged();
      }
    } catch {
      setError('The app could not be reached.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div>
        <label
          htmlFor="current-password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="new-password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(event) => setNext(event.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          At least {MIN_PASSWORD_LENGTH} characters. The other machines are signed out when it
          changes.
        </p>
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          The same new password again
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className={inputClass}
        />
      </div>

      <Feedback error={error} message={message} />

      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? 'Saving…' : 'Change the password'}
      </button>
    </form>
  );
}

/** Where the account is signed in. */
function Sessions({ sessions, onChanged }: { sessions: SessionSummary[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const others = sessions.filter((session) => !session.current).length;

  async function endOthers() {
    setBusy(true);
    await fetch('/api/auth/sessions', { method: 'POST' }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  return (
    <div className="space-y-2.5">
      <ul className="space-y-2">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="rounded-xl border border-slate-200 p-2.5 text-sm dark:border-slate-700"
          >
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {describeAgent(session.userAgent)}
              {session.current && (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  This one
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Started {session.createdAt} · last used {session.lastSeenAt}
            </p>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={endOthers}
        disabled={busy || others === 0}
        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
      >
        {others === 0 ? 'No other machine is signed in' : `Sign out the other ${others}`}
      </button>
    </div>
  );
}

/** The way out. */
function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
