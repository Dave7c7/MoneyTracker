'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MIN_PASSWORD_LENGTH } from '@moneytracker/core';

/**
 * The sign-in form.
 *
 * On a fresh install it asks for a password twice and sets it; after that it
 * asks for the one password that is already set. The email is the local
 * account's, filled in by the server, so a single-user install only ever types
 * a password.
 */
export function LoginForm({
  mode,
  email,
  challenge,
}: {
  mode: 'setup' | 'signin';
  email: string;
  /** Why the user was sent here, when the page knows. */
  challenge?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(challenge ?? null);
  const [busy, setBusy] = useState(false);

  const isSetup = mode === 'setup';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (isSetup && password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }
    if (isSetup && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(isSetup ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isSetup ? { password } : { email, password }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? 'That did not work.');
        setBusy(false);
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('The app could not be reached.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!isSetup && <input type="hidden" name="email" value={email} />}

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {isSetup ? 'Choose a password' : 'Password'}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSetup ? 'new-password' : 'current-password'}
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        {isSetup && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            At least {MIN_PASSWORD_LENGTH} characters. A short sentence is easier to remember than a
            puzzle, and harder to guess.
          </p>
        )}
      </div>

      {isSetup && (
        <div>
          <label
            htmlFor="confirmation"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            The same password again
          </label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-2.5 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {busy
          ? isSetup
            ? 'Setting it…'
            : 'Signing in…'
          : isSetup
            ? 'Set the password'
            : 'Sign in'}
      </button>
    </form>
  );
}
