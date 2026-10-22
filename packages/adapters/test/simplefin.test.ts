import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SimpleFinAdapter,
  SimpleFinError,
  accountTypeOf,
  claimAccessUrl,
  decodeSetupToken,
  splitAccountName,
  type FetchLike,
} from '../src/simplefin/index.ts';
import { describeAdapterContract } from './contract.ts';

/** The account set the fake server answers with. */
const ACCOUNT_SET = {
  errlist: [],
  connections: [{ conn_id: 'CON-1', name: 'SoFi', org_id: 'ORG-1', sfin_url: 'https://x' }],
  accounts: [
    {
      id: '2930002',
      name: 'Everyday Checking 4417',
      conn_id: 'CON-1',
      currency: 'USD',
      balance: '1234.56',
      'balance-date': 1_767_225_600,
      transactions: [
        {
          id: 'tx-1',
          posted: 1_767_225_600,
          amount: '-45.00',
          description: 'BLUE BOTTLE COFFEE',
        },
        {
          id: 'tx-2',
          posted: 1_767_225_600,
          amount: '2500.00',
          description: 'PAYROLL',
        },
        {
          id: 'tx-3',
          posted: 0,
          amount: '-12.34',
          description: 'PENDING COFFEE',
          pending: true,
        },
      ],
    },
    {
      id: '2930003',
      name: 'Rewards Credit Card',
      conn_id: 'CON-1',
      currency: 'USD',
      balance: '-876.25',
      'balance-date': 1_767_225_600,
      transactions: [],
    },
  ],
};

let server: { url: string; close: () => Promise<void> };
let requests: string[] = [];

/** Starts a server that answers like SimpleFIN does. */
async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import('node:http');

  const instance = createServer((request, response) => {
    requests.push(request.url ?? '');
    const body = JSON.stringify(ACCOUNT_SET);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(body);
  });

  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/simplefin`,
    close: () => new Promise<void>((resolve) => instance.close(() => resolve())),
  };
}

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.close();
});

/** The access URL the fake server is reached with. */
function accessUrl(): string {
  return server.url.replace('http://', 'http://demo:token@');
}

describeAdapterContract('simplefin', () => new SimpleFinAdapter({ accessUrl: accessUrl() }));

describe('the SimpleFIN adapter', () => {
  it('reads the accounts of the connection', async () => {
    const adapter = new SimpleFinAdapter({ accessUrl: accessUrl() });
    const accounts = await adapter.fetchAccounts();

    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({
      externalId: 'CON-1:2930002',
      name: 'Everyday Checking',
      type: 'checking',
      currency: 'USD',
      mask: '4417',
    });
    expect(accounts[1]).toMatchObject({
      externalId: 'CON-1:2930003',
      name: 'Rewards Credit Card',
      type: 'credit_card',
      isLiability: true,
    });
  });

  it('reads the transactions with their amounts in minor units', async () => {
    const adapter = new SimpleFinAdapter({ accessUrl: accessUrl() });
    await adapter.fetchAccounts();
    const transactions = await adapter.fetchTransactions('CON-1:2930002');

    expect(transactions).toHaveLength(3);
    expect(transactions[0]).toMatchObject({
      amountMinor: -4500,
      currency: 'USD',
      descriptionRaw: 'BLUE BOTTLE COFFEE',
      pending: false,
    });
    // Money in is positive.
    expect(transactions[1]).toMatchObject({ amountMinor: 250_000 });
    // A pending transaction has no date.
    expect(transactions[2]).toMatchObject({ pending: true, postedAt: null });
  });

  it('reads the balances with their dates', async () => {
    const adapter = new SimpleFinAdapter({ accessUrl: accessUrl() });
    const balances = await adapter.fetchBalances();

    expect(balances).toHaveLength(2);
    expect(balances[0]).toMatchObject({
      accountExternalId: 'CON-1:2930002',
      balanceMinor: 123_456,
      currency: 'USD',
    });
    expect(balances[0]?.asOf).toBeInstanceOf(Date);
  });

  it('reads only the accounts the connection is linked to', async () => {
    const adapter = new SimpleFinAdapter({
      accessUrl: accessUrl(),
      accountExternalIds: ['CON-1:2930003'],
    });
    const accounts = await adapter.fetchAccounts();

    expect(accounts.map((account) => account.externalId)).toEqual(['CON-1:2930003']);
  });

  it('asks for the history in slices the API allows', async () => {
    requests = [];
    const adapter = new SimpleFinAdapter({ accessUrl: accessUrl(), historyDays: 200 });
    await adapter.fetchAccounts();

    // 200 days do not fit in one request of 90 days.
    expect(requests.length).toBeGreaterThan(1);
    for (const url of requests) {
      const start = Number(new URL(`http://x${url}`).searchParams.get('start-date'));
      const end = Number(new URL(`http://x${url}`).searchParams.get('end-date'));
      expect(end - start).toBeLessThanOrEqual(90 * 86_400);
    }
  });

  it('asks for less when the last sync was recent', async () => {
    requests = [];
    const adapter = new SimpleFinAdapter({
      accessUrl: accessUrl(),
      historyDays: 90,
      since: new Date(Date.now() - 2 * 86_400_000),
    });
    await adapter.fetchAccounts();

    expect(requests).toHaveLength(1);
    const url = new URL(`http://x${requests[0]}`);
    const start = Number(url.searchParams.get('start-date'));
    const end = Number(url.searchParams.get('end-date'));
    // The window overlaps the last sync by a few days, not by 90.
    expect(end - start).toBeLessThan(10 * 86_400);
  });

  it('sends the credentials with the request', async () => {
    const seen: (string | undefined)[] = [];
    const fetchImpl: FetchLike = async (_input, init) => {
      seen.push(init?.headers?.Authorization);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(ACCOUNT_SET),
      };
    };

    const adapter = new SimpleFinAdapter({
      accessUrl: 'https://demo:token@beta-bridge.simplefin.org/simplefin',
      fetchImpl,
    });
    await adapter.fetchAccounts();

    expect(seen[0]).toBe(`Basic ${Buffer.from('demo:token').toString('base64')}`);
  });

  it('says what SimpleFIN reported', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ errlist: [{ code: 'act.failed', msg: 'Try again later.' }] }),
    });

    const adapter = new SimpleFinAdapter({
      accessUrl: 'https://demo:token@beta-bridge.simplefin.org/simplefin',
      fetchImpl,
    });

    await expect(adapter.fetchAccounts()).rejects.toThrow(/Try again later/);
  });

  it('says when the access was refused', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 403, text: async () => '' });

    const adapter = new SimpleFinAdapter({
      accessUrl: 'https://demo:token@beta-bridge.simplefin.org/simplefin',
      fetchImpl,
    });

    await expect(adapter.fetchAccounts()).rejects.toThrow(/revoked|Setup/i);
  });
});

describe('claiming a setup token', () => {
  const token = Buffer.from('https://beta-bridge.simplefin.org/simplefin/claim/demo').toString(
    'base64',
  );

  it('exchanges the token for an access URL', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => 'https://demo:token@beta-bridge.simplefin.org/simplefin',
    });

    const accessUrl = await claimAccessUrl(token, fetchImpl);
    expect(accessUrl).toBe('https://demo:token@beta-bridge.simplefin.org/simplefin');
  });

  it('warns when the token was already used', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 403, text: async () => '' });

    await expect(claimAccessUrl(token, fetchImpl)).rejects.toThrow(/revoke it/);
  });

  it('refuses a token that is not a token', () => {
    expect(() => decodeSetupToken('not a token')).toThrow(SimpleFinError);
    expect(() => decodeSetupToken('')).toThrow(/empty/);
  });

  it('refuses a token that does not point at a secure address', () => {
    const token = Buffer.from('http://example.com/claim').toString('base64');
    expect(() => decodeSetupToken(token)).toThrow(/secure/);
  });
});

describe('reading an account name', () => {
  it('takes the last four digits off as the mask', () => {
    expect(splitAccountName('Everyday Checking 4417')).toEqual({
      name: 'Everyday Checking',
      mask: '4417',
    });
    expect(splitAccountName('Savings ••1234')).toEqual({ name: 'Savings', mask: '1234' });
  });

  it('leaves a name without digits alone', () => {
    expect(splitAccountName('Everyday Checking')).toEqual({
      name: 'Everyday Checking',
      mask: null,
    });
  });

  it('guesses the kind of account from its name', () => {
    expect(accountTypeOf('Rewards Credit Card')).toBe('credit_card');
    expect(accountTypeOf('High-Yield Savings')).toBe('savings');
    expect(accountTypeOf('Auto Loan')).toBe('loan');
    expect(accountTypeOf('Everyday Checking')).toBe('checking');
  });
});
