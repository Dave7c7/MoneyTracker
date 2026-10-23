'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

const buttonClass =
  'w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900';

const quietButtonClass =
  'rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200';

/** What the account screen knows about two-factor. */
export interface TwoFactorSummary {
  enabled: boolean;
  /** Already formatted for the screen. */
  enabledAt: string | null;
  /** A secret was made but no code has confirmed it yet. */
  pending: boolean;
  recoveryCodesLeft: number;
}

/**
 * Two-factor sign-in: one card, three states.
 *
 * Off: a password and a button. Setting it up: the secret to type into the
 * authenticator app and a code to prove it works; that is the only moment the
 * secret is on screen, because only its encrypted form is stored. On: when it
 * started, how many recovery codes are left, and the password again to turn it
 * off.
 *
 * There is no QR code: that would be a dependency, and every authenticator
 * accepts a typed secret. The `otpauth://` link opens the app on a phone.
 */
export function TwoFactor({ status }: { status: TwoFactorSummary }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch('/api/auth/totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(result.error ?? 'That did not work.'));
    return result;
  }

  /** Runs one action with the same busy flag and error handling. */
  async function run(action: () => Promise<void>) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function start(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await send({ action: 'start', currentPassword: password });
      setSecret(String(result.secret));
      setUri(String(result.uri));
      setPassword('');
    });
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await send({ action: 'confirm', code });
      setRecoveryCodes(Array.isArray(result.recoveryCodes) ? (result.recoveryCodes as string[]) : []);
      setSecret(null);
      setUri(null);
      setCode('');
      router.refresh();
    });
  }

  async function disable(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await send({ action: 'disable', currentPassword: password });
      setPassword('');
      setMessage('Two-factor is off. The secret and the recovery codes are gone.');
      router.refresh();
    });
  }

  if (recoveryCodes) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Two-factor is on. These are your recovery codes — the way in if the phone is lost. Each
          one works once. <strong>They are not shown again.</strong>
        </p>
        <ul className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-50 p-3 font-mono text-sm text-slate-800 dark:bg-slate-950 dark:text-slate-100">
          {recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode}>{recoveryCode}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRecoveryCodes(null)}
          className={buttonClass}
        >
          I have written them down
        </button>
      </div>
    );
  }

  if (secret) {
    return (
      <form onSubmit={confirm} className="space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Add this secret to your authenticator app, then type the six digits it shows. The secret
          is shown once.
        </p>
        <code className="block break-all rounded-xl bg-slate-50 p-3 font-mono text-sm text-slate-800 dark:bg-slate-950 dark:text-slate-100">
          {secret}
        </code>
        {uri && (
          <a
            href={uri}
            className="block break-all text-xs text-sky-700 underline dark:text-sky-300"
          >
            Open in an authenticator app
          </a>
        )}
        <div>
          <label
            htmlFor="totp-code"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            The code it shows
          </label>
          <input
            id="totp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={inputClass}
          />
        </div>
        <Feedback error={error} message={message} />
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Checking…' : 'Confirm and turn on'}
        </button>
      </form>
    );
  }

  if (status.enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          On{status.enabledAt ? ` since ${status.enabledAt}` : ''}. Signing in asks for a code from
          your authenticator app after the password.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {status.recoveryCodesLeft === 1
            ? '1 recovery code is left.'
            : `${status.recoveryCodesLeft} recovery codes are left.`}{' '}
          When they run out, turn two-factor off and on again for a new set.
        </p>
        <form onSubmit={disable} className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div>
            <label
              htmlFor="totp-password-off"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Current password, to turn it off
            </label>
            <input
              id="totp-password-off"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </div>
          <Feedback error={error} message={message} />
          <button type="submit" disabled={busy} className={quietButtonClass}>
            {busy ? 'Turning off…' : 'Turn off two-factor'}
          </button>
        </form>
      </div>
    );
  }

  if (status.pending) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          A setup was started but no code ever confirmed it, so signing in does not ask for one yet.
          Start again to get a fresh secret.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(async () => {
            const result = await send({ action: 'start', currentPassword: password });
            setSecret(String(result.secret));
            setUri(String(result.uri));
          })}
          className={quietButtonClass}
        >
          Start again
        </button>
        <Feedback error={error} message={message} />
      </div>
    );
  }

  return (
    <form onSubmit={start} className="space-y-3">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        A code from an authenticator app, on top of the password. Worth it: the app is reachable
        from the network, and a password on its own can be guessed.
      </p>
      <div>
        <label
          htmlFor="totp-password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Current password, to turn it on
        </label>
        <input
          id="totp-password"
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
        {busy ? 'Starting…' : 'Turn on two-factor'}
      </button>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Needs <code>ENCRYPTION_KEY</code> in <code>.env</code> — the secret is stored encrypted.
      </p>
    </form>
  );
}

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
