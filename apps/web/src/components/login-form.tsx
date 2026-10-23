'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MIN_PASSWORD_LENGTH } from '@moneytracker/core';

/**
 * The sign-in form.
 *
 * On a fresh install it shows the account's address and asks for a password
 * twice to set it. After that it asks for the address and the password, with
 * the address already filled in: a single-user install only has to type a
 * password, but the address can be changed.
 */
export function LoginForm({
  mode,
  email: initialEmail,
  challenge,
}: {
  mode: 'setup' | 'signin';
  email: string;
  /** Why the user was sent here, when the page knows. */
  challenge?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
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

  const inputClass =
    'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

  return (
    <form onSubmit={submit} className="space-y-3">
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
          readOnly={isSetup}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`${inputClass} ${isSetup ? 'opacity-70' : ''}`}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {isSetup
            ? 'The account this app was installed with. You can change it afterwards.'
            : 'The address this app signs in with.'}
        </p>
      </div>

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
          className={inputClass}
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
            className={inputClass}
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
