/**
 * The SimpleFIN data source.
 *
 * SimpleFIN is a read-only protocol: the user connects their bank at
 * SimpleFIN, gets a setup token, and gives that token to the app. The app
 * exchanges it for an access URL and reads the accounts and transactions
 * through it. The app never sees the bank password.
 *
 * The limits are known and the app is built around them: the history window
 * of one request is 90 days, the data is refreshed about once a day, and a
 * transaction that has not posted yet may not be reported at all.
 */

import {
  currencyMinorUnits,
  parseAmountToMinor,
  type AccountType,
  type DataSourceAdapter,
  type NormalizedAccount,
  type NormalizedBalance,
  type NormalizedTransaction,
} from '@moneytracker/core';

/** How many days one request may ask for. The API refuses more. */
export const SIMPLEFIN_SLICE_DAYS = 90;

/** How many days of history a connection reaches by default. */
export const SIMPLEFIN_DEFAULT_HISTORY_DAYS = 90;

/**
 * How many days the window of a sync overlaps the last one.
 *
 * The protocol says to overlap, so a transaction that was posted late still
 * arrives.
 */
export const SIMPLEFIN_OVERLAP_DAYS = 5;

/** How a request is made. Tests hand in their own. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/** What the adapter needs to talk to SimpleFIN. */
export interface SimpleFinOptions {
  /**
   * The access URL, with the credentials in it.
   *
   * It is a password for the transactions, so it is stored encrypted and
   * never shown.
   */
  accessUrl: string;
  /** Which accounts to read, by external id. Empty means every account. */
  accountExternalIds?: readonly string[];
  /** How far back to reach, in days. */
  historyDays?: number;
  /**
   * The moment the last sync reached.
   *
   * The window starts a few days earlier, because the protocol says to
   * overlap: a transaction that was posted late still arrives.
   */
  since?: Date;
  /** How to make requests. */
  fetchImpl?: FetchLike;
}

/** An error the app can show the user. */
export class SimpleFinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimpleFinError';
  }
}

/** One account as SimpleFIN sends it. */
interface SimpleFinAccount {
  id: string;
  name: string;
  conn_id?: string;
  currency: string;
  balance?: string;
  'available-balance'?: string;
  'balance-date'?: number;
  transactions?: SimpleFinTransaction[];
}

/** One transaction as SimpleFIN sends it. */
interface SimpleFinTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  pending?: boolean;
}

/** The account set SimpleFIN answers with. */
interface SimpleFinAccountSet {
  errlist?: { code?: string; msg?: string }[];
  errors?: string[];
  accounts?: SimpleFinAccount[];
}

/**
 * Exchanges a setup token for an access URL.
 *
 * The token can only be used once. A 403 means it was already claimed, which
 * may mean someone else has the data, so the user is told to disable it.
 *
 * @example
 * const accessUrl = await claimAccessUrl(setupToken);
 */
export async function claimAccessUrl(
  setupToken: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken);

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(claimUrl, {
      method: 'POST',
      headers: { 'Content-Length': '0' },
    });
  } catch {
    throw new SimpleFinError('SimpleFIN could not be reached. Check the connection and try again.');
  }

  if (response.status === 403) {
    throw new SimpleFinError(
      'This setup token has already been used. Someone may have claimed it, so revoke it at ' +
        'SimpleFIN and create a new one.',
    );
  }
  if (!response.ok) {
    throw new SimpleFinError(`SimpleFIN refused the setup token (HTTP ${response.status}).`);
  }

  const accessUrl = (await response.text()).trim();
  if (!isSecureAddress(accessUrl)) {
    throw new SimpleFinError('SimpleFIN did not return a usable access URL.');
  }
  return accessUrl;
}

/**
 * Decodes a setup token into the URL to claim.
 *
 * The token is base64 of a URL. It is never a bank password: it only allows
 * reading the accounts it was made for.
 *
 * @example
 * decodeSetupToken('aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw==');
 */
export function decodeSetupToken(setupToken: string): string {
  const token = setupToken.trim();
  if (token.length === 0) throw new SimpleFinError('The setup token is empty.');

  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch {
    throw new SimpleFinError('The setup token is not a SimpleFIN token.');
  }

  let url: URL;
  try {
    url = new URL(decoded);
  } catch {
    throw new SimpleFinError('The setup token is not a SimpleFIN token.');
  }

  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new SimpleFinError('The setup token does not point at a secure address.');
  }
  return url.toString();
} /**
 * The data source for a SimpleFIN connection.
 *
 * One access URL can cover several banks. Every account is identified by its
 * connection and its own id, so two banks that both call an account
 * "2930002" stay apart.
 *
 * @example
 * const adapter = new SimpleFinAdapter({ accessUrl });
 * await adapter.fetchAccounts();
 */
export class SimpleFinAdapter implements DataSourceAdapter {
  readonly id = 'simplefin';

  private readonly options: SimpleFinOptions;
  private readonly fetchImpl: FetchLike;
  /** The accounts and transactions read so far, by external id. */
  private readonly accounts = new Map<string, SimpleFinAccount>();
  private readonly transactions = new Map<string, SimpleFinTransaction[]>();
  /** The earliest moment the cache covers. */
  private coveredFrom: number | null = null;
  /** The accounts the connection is allowed to read. */
  private readonly wanted: Set<string> | null;

  constructor(options: SimpleFinOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
    this.wanted =
      options.accountExternalIds && options.accountExternalIds.length > 0
        ? new Set(options.accountExternalIds)
        : null;
  }

  async fetchAccounts(): Promise<NormalizedAccount[]> {
    await this.ensureWindow(this.historyStart(), Date.now());

    const accounts: NormalizedAccount[] = [];
    for (const account of this.accounts.values()) {
      const externalId = externalIdOf(account);
      if (this.wanted && !this.wanted.has(externalId)) continue;
      accounts.push(toNormalizedAccount(account));
    }
    return accounts;
  }

  async fetchTransactions(accountId: string, since?: Date): Promise<NormalizedTransaction[]> {
    const account = this.findAccount(accountId);
    if (!account) return [];

    if (since && (this.coveredFrom === null || since.getTime() < this.coveredFrom)) {
      await this.ensureWindow(since.getTime(), Date.now());
    }

    const currency = normalizeCurrency(account.currency);
    const minorUnits = currencyMinorUnits(currency);
    const rows = this.transactions.get(accountId) ?? [];

    return rows
      .filter((row) => {
        if (!since) return true;
        const posted = postedAt(row);
        if (!posted) return true;
        return posted.getTime() >= since.getTime();
      })
      .map((row) => toNormalizedTransaction(row, account, currency, minorUnits))
      .filter((row): row is NormalizedTransaction => row !== null);
  }

  async fetchBalances(): Promise<NormalizedBalance[]> {
    if (this.accounts.size === 0) {
      await this.ensureWindow(this.historyStart(), Date.now());
    }

    const balances: NormalizedBalance[] = [];
    for (const account of this.accounts.values()) {
      const externalId = externalIdOf(account);
      if (this.wanted && !this.wanted.has(externalId)) continue;
      if (account.balance === undefined || account['balance-date'] === undefined) continue;

      const currency = normalizeCurrency(account.currency);
      const balanceMinor = parseAmountToMinor(account.balance, {
        decimalSeparator: '.',
        minorUnits: currencyMinorUnits(currency),
      });
      if (balanceMinor === null) continue;

      balances.push({
        accountExternalId: externalId,
        asOf: new Date(account['balance-date'] * 1000),
        balanceMinor,
        currency,
      });
    }
    return balances;
  }

  /** The external ids of every account the connection can reach. */
  async listAccountIds(): Promise<string[]> {
    await this.ensureWindow(this.historyStart(), Date.now());
    return [...this.accounts.values()].map(externalIdOf);
  }

  /** Reads the window from its start to its end, in slices the API allows. */
  private async ensureWindow(startMs: number, endMs: number): Promise<void> {
    const sliceMs = SIMPLEFIN_SLICE_DAYS * 86_400_000;
    let cursor = endMs;
    let guard = 0;

    while (cursor > startMs && guard < 24) {
      guard += 1;
      const sliceStart = Math.max(startMs, cursor - sliceMs);
      await this.fetchSlice(sliceStart, cursor);
      if (this.coveredFrom !== null && this.coveredFrom <= sliceStart) break;
      cursor = sliceStart;
    }

    if (this.coveredFrom === null || this.coveredFrom > startMs) this.coveredFrom = startMs;
  }

  /** Reads one window of at most 90 days. */
  private async fetchSlice(startMs: number, endMs: number): Promise<void> {
    const { url, auth } = splitAccessUrl(this.options.accessUrl);
    const query = new URLSearchParams({
      version: '2',
      'start-date': String(Math.floor(startMs / 1000)),
      'end-date': String(Math.floor(endMs / 1000)),
      pending: '1',
    });

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(`${url}/accounts?${query.toString()}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
    } catch {
      throw new SimpleFinError(
        'SimpleFIN could not be reached. Check the connection and try again.',
      );
    }

    if (response.status === 403) {
      throw new SimpleFinError(
        'SimpleFIN refused the access. It may have been revoked, so check the connection at ' +
          'SimpleFIN and give the app a new setup token.',
      );
    }
    if (!response.ok) {
      throw new SimpleFinError(`SimpleFIN answered with an error (HTTP ${response.status}).`);
    }

    let payload: SimpleFinAccountSet;
    try {
      payload = JSON.parse(await response.text()) as SimpleFinAccountSet;
    } catch {
      throw new SimpleFinError('SimpleFIN answered with something this app cannot read.');
    }

    const errors = payload.errlist ?? [];
    if (errors.length > 0) {
      const messages = errors
        .map((error) => sanitizeMessage(error.msg ?? error.code ?? 'Unknown error'))
        .filter((message) => message.length > 0);
      if (messages.length > 0) {
        throw new SimpleFinError(`SimpleFIN reported: ${messages.join('; ')}`);
      }
    }

    for (const account of payload.accounts ?? []) {
      const externalId = externalIdOf(account);
      this.accounts.set(externalId, account);

      const rows = this.transactions.get(externalId) ?? [];
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const transaction of account.transactions ?? []) {
        byId.set(transaction.id, transaction);
      }
      this.transactions.set(externalId, [...byId.values()]);
    }
  }

  /** The account behind an external id, if it was read. */
  private findAccount(externalId: string): SimpleFinAccount | null {
    const direct = this.accounts.get(externalId);
    if (direct) return direct;

    for (const account of this.accounts.values()) {
      if (externalIdOf(account) === externalId) return account;
    }
    return null;
  }

  /** How far back the connection reaches. */
  private historyStart(): number {
    const days = this.options.historyDays ?? SIMPLEFIN_DEFAULT_HISTORY_DAYS;
    const fromHistory = Date.now() - days * 86_400_000;
    if (!this.options.since) return fromHistory;

    // The window overlaps the last sync by a few days, so a transaction that
    // was posted late still arrives.
    const fromSince = this.options.since.getTime() - SIMPLEFIN_OVERLAP_DAYS * 86_400_000;
    return Math.max(fromHistory, fromSince);
  }
}

/** The id an account is known by: its connection and its own id. */
export function externalIdOf(account: SimpleFinAccount): string {
  return `${account.conn_id ?? 'simplefin'}:${account.id}`;
}

/** The name of the account, without the digits the bank put at the end. */
export function splitAccountName(name: string): { name: string; mask: string | null } {
  const trimmed = name.trim();
  const match = /^(.*?)[\s•]*(\d{4})$/.exec(trimmed);
  if (!match) return { name: trimmed, mask: null };

  const label = (match[1] ?? '').trim();
  if (label.length === 0) return { name: trimmed, mask: null };
  return { name: label, mask: match[2] ?? null };
}

/** The kind of account, guessed from the name the bank gave it. */
export function accountTypeOf(name: string): AccountType {
  if (/credit\s*card/i.test(name)) return 'credit_card';
  if (/loan|mortgage/i.test(name)) return 'loan';
  if (/savings/i.test(name)) return 'savings';
  if (/cash/i.test(name)) return 'cash';
  return 'checking';
}

/** Turns one SimpleFIN account into the shape the app stores. */
function toNormalizedAccount(account: SimpleFinAccount): NormalizedAccount {
  const { name, mask } = splitAccountName(account.name);
  const type = accountTypeOf(account.name);

  return {
    externalId: externalIdOf(account),
    name,
    type,
    currency: normalizeCurrency(account.currency),
    mask: mask ?? undefined,
    isLiability: type === 'credit_card' || type === 'loan',
  };
}

/** Turns one SimpleFIN transaction into the shape the app stores. */
function toNormalizedTransaction(
  transaction: SimpleFinTransaction,
  account: SimpleFinAccount,
  currency: string,
  minorUnits: number,
): NormalizedTransaction | null {
  const amountMinor = parseAmountToMinor(transaction.amount, {
    decimalSeparator: '.',
    minorUnits,
  });
  if (amountMinor === null) return null;

  // A transaction that has not posted has no date. The protocol says so
  // twice: the date is zero, and the flag is set.
  const pending = transaction.pending === true || !transaction.posted;
  const posted = postedAt(transaction);

  return {
    externalId: `${externalIdOf(account)}:${transaction.id}`,
    accountId: externalIdOf(account),
    postedAt: pending ? null : posted,
    pending,
    amountMinor,
    currency,
    descriptionRaw: transaction.description.trim() || 'Transaction',
  };
}

/** When a transaction posted. A pending transaction has no date. */
function postedAt(transaction: SimpleFinTransaction): Date | null {
  if (!transaction.posted) return null;
  return new Date(transaction.posted * 1000);
}

/** The currency code, or dollars when the bank sent something else. */
function normalizeCurrency(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) return code;
  // A custom currency is a URL. The app cannot price it, so it is dollars.
  return 'USD';
}

/** The access URL without its credentials, and the credentials to send. */
function splitAccessUrl(accessUrl: string): { url: string; auth: string } {
  let parsed: URL;
  try {
    parsed = new URL(accessUrl);
  } catch {
    throw new SimpleFinError('The stored access URL is not usable.');
  }

  if (
    parsed.protocol !== 'https:' &&
    parsed.hostname !== '127.0.0.1' &&
    parsed.hostname !== 'localhost'
  ) {
    throw new SimpleFinError('The stored access URL is not a secure address.');
  }

  const credentials = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';

  return {
    url: parsed.toString().replace(/\/$/, ''),
    auth: Buffer.from(credentials).toString('base64'),
  };
}

/**
 * Whether an address is one the app is willing to talk to.
 *
 * The protocol says only secure addresses, and the app never sends a
 * credential over plain http. A server on this machine is allowed, so the
 * app can be tested and a self-hosted server can be used.
 */
function isSecureAddress(address: string): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
}

/** Keeps an error message safe to show. */
function sanitizeMessage(message: string): string {
  return message
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 200);
}
