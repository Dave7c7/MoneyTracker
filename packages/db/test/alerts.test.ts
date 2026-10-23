/**
 * Integration tests for alerts.
 *
 * The rules themselves are pure and tested in `core`; these check the parts
 * that touch the database: what gets stored, what is refused because it was
 * already said, and what happens when a webhook does not answer.
 */

import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabase, type Database } from '../src/client.ts';
import { ensureDefaultCategories, ensureLocalUser } from '../src/bootstrap.ts';
import { loadDotEnv } from '../src/env.ts';
import {
  countUnreadAlerts,
  createAlert,
  deliverAlerts,
  evaluateAlerts,
  listAlerts,
  markAlertRead,
  markAllAlertsRead,
} from '../src/alerts.ts';
import {
  accounts,
  budgets,
  categories,
  categoryAssignments,
  connections,
  recurringItems,
  transactions,
} from '../src/schema.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** A fixed moment in October 2026, so "this month" is not whatever today is. */
const NOW = new Date('2026-10-15T12:00:00.000Z');
const TODAY = '2026-10-15';

describe.skipIf(!testDatabaseUrl)('alerts', () => {
  let db: Database;
  let userId: string;
  let accountId: string;
  let groceriesId: string;
  let transferCategoryId: string;
  let counter = 0;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const created = createDatabase(testDatabaseUrl!, { max: 4 });
    db = created.db;
    close = () => created.pool.end();
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table alerts, recovery_codes, sessions, split_lines, category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, import_profiles, connection_accounts, connections, recurring_items, budgets, savings_goals, transfer_groups, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'alerts@example.com',
      displayName: 'Alerts',
      timeZone: 'UTC',
    });
    userId = user.id;
    await ensureDefaultCategories(db, userId);

    const account = await db
      .insert(accounts)
      .values({
        userId,
        adapterId: 'mock',
        externalId: 'acc-1',
        name: 'Checking',
        type: 'checking',
        currency: 'USD',
      })
      .returning({ id: accounts.id });
    accountId = account[0]!.id;

    const own = await db
      .insert(categories)
      .values({ userId, name: 'Groceries', slug: 'test-groceries', kind: 'spending' })
      .returning({ id: categories.id });
    groceriesId = own[0]!.id;

    const transfer = await db
      .insert(categories)
      .values({ userId, name: 'Transfer', slug: 'test-transfer', kind: 'transfer' })
      .returning({ id: categories.id });
    transferCategoryId = transfer[0]!.id;
  });

  /** Adds a transaction on the checking account. */
  async function addTransaction(input: {
    amountMinor: number;
    description: string;
    postedAt?: Date;
    pending?: boolean;
    categoryId?: string;
  }): Promise<string> {
    const postedAt = input.postedAt ?? NOW;
    counter += 1;

    const rows = await db
      .insert(transactions)
      .values({
        userId,
        accountId,
        externalId: `txn-${counter}`,
        postedAt,
        postedDate: postedAt.toISOString().slice(0, 10),
        pending: input.pending ?? false,
        amountMinor: input.amountMinor,
        currency: 'USD',
        descriptionRaw: input.description,
        merchantRaw: input.description,
        sourceAdapter: 'mock',
      })
      .returning({ id: transactions.id });

    const id = rows[0]!.id;
    if (input.categoryId) {
      await db.insert(categoryAssignments).values({
        transactionId: id,
        userId,
        categoryId: input.categoryId,
        source: 'user_manual',
        confidence: 1,
        reason: 'A test put it there.',
        locked: true,
      });
    }
    return id;
  }

  /** Runs the checker with the settings a small install would use. */
  function evaluate(overrides: { largeTransactionMinor?: number } = {}) {
    return evaluateAlerts(db, userId, {
      timeZone: 'UTC',
      currency: 'USD',
      now: NOW,
      largeTransactionMinor: overrides.largeTransactionMinor ?? 0,
    });
  }

  describe('the inbox', () => {
    const draft = {
      kind: 'budget' as const,
      title: 'Groceries is at 91% of its budget',
      body: 'Spent $455.00 of $500.00 this month.',
      href: '/budgets',
      dedupeKey: 'budget:one:2026-10:near',
    };

    it('stores something once, whatever the caller does', async () => {
      expect(await createAlert(db, userId, draft)).toBe(true);
      expect(await createAlert(db, userId, draft)).toBe(false);

      const rows = await listAlerts(db, userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.readAt).toBeNull();
      expect(rows[0]?.notifiedAt).toBeNull();
    });

    it('counts what is new, marks one read, then all', async () => {
      await createAlert(db, userId, draft);
      await createAlert(db, userId, { ...draft, dedupeKey: 'other', title: 'Another' });
      expect(await countUnreadAlerts(db, userId)).toBe(2);

      const rows = await listAlerts(db, userId);
      expect(await markAlertRead(db, userId, rows[0]!.id)).toBe(true);
      expect(await markAlertRead(db, userId, rows[0]!.id)).toBe(false);
      expect(await countUnreadAlerts(db, userId)).toBe(1);

      expect(await markAllAlertsRead(db, userId)).toBe(1);
      expect(await countUnreadAlerts(db, userId)).toBe(0);
    });

    it('does not mark someone else’s alert', async () => {
      await createAlert(db, userId, draft);
      const rows = await listAlerts(db, userId);
      expect(await markAlertRead(db, userId, '00000000-0000-0000-0000-000000000000')).toBe(false);

      const unread = await listAlerts(db, userId, { unreadOnly: true });
      expect(unread.map((row) => row.id)).toEqual([rows[0]!.id]);
    });
  });

  describe('budgets', () => {
    async function setBudget(amountMinor: number) {
      await db.insert(budgets).values({ userId, categoryId: groceriesId, amountMinor });
    }

    it('speaks up at ninety percent and not again for the same month', async () => {
      await setBudget(50_000);
      await addTransaction({
        amountMinor: -45_500,
        description: 'Market',
        categoryId: groceriesId,
      });

      const raised = await evaluate();
      expect(raised).toHaveLength(1);
      expect(raised[0]?.title).toBe('Groceries is at 91% of its budget');

      expect(await evaluate()).toHaveLength(0);
    });

    it('says it again, once, when the limit is passed', async () => {
      await setBudget(50_000);
      await addTransaction({
        amountMinor: -45_500,
        description: 'Market',
        categoryId: groceriesId,
      });
      await evaluate();

      await addTransaction({
        amountMinor: -10_000,
        description: 'More market',
        categoryId: groceriesId,
      });
      const raised = await evaluate();

      expect(raised).toHaveLength(1);
      expect(raised[0]?.title).toBe('Groceries is over budget');
      expect(raised[0]?.dedupeKey).toBe('budget:' + (await budgetId()) + ':2026-10:over');
    });

    it('says nothing while the month is comfortable', async () => {
      await setBudget(50_000);
      await addTransaction({
        amountMinor: -10_000,
        description: 'Market',
        categoryId: groceriesId,
      });

      expect(await evaluate()).toHaveLength(0);
    });

    it('leaves a transfer out of the spending', async () => {
      await setBudget(50_000);
      await addTransaction({
        amountMinor: -45_500,
        description: 'Moved to savings',
        categoryId: transferCategoryId,
      });

      expect(await evaluate()).toHaveLength(0);
    });

    async function budgetId(): Promise<string> {
      const rows = await db
        .select({ id: budgets.id })
        .from(budgets)
        .where(eq(budgets.userId, userId));
      return rows[0]!.id;
    }
  });

  describe('large charges', () => {
    it('speaks up for a charge above the threshold, once', async () => {
      const id = await addTransaction({ amountMinor: -60_000, description: 'A new laptop' });

      const raised = await evaluate({ largeTransactionMinor: 50_000 });
      expect(raised).toHaveLength(1);
      expect(raised[0]?.title).toBe('A new laptop: $600.00');
      expect(raised[0]?.dedupeKey).toBe(`transaction:${id}`);

      expect(await evaluate({ largeTransactionMinor: 50_000 })).toHaveLength(0);
    });

    it('stays quiet below the threshold', async () => {
      await addTransaction({ amountMinor: -49_999, description: 'Almost' });
      expect(await evaluate({ largeTransactionMinor: 50_000 })).toHaveLength(0);
    });

    it('stays quiet for pending charges, transfers and income', async () => {
      await addTransaction({ amountMinor: -60_000, description: 'Pending', pending: true });
      await addTransaction({
        amountMinor: -60_000,
        description: 'Transfer',
        categoryId: transferCategoryId,
      });
      await addTransaction({ amountMinor: 600_000, description: 'Paycheck' });

      expect(await evaluate({ largeTransactionMinor: 50_000 })).toHaveLength(0);
    });

    it('ignores old charges, which are not news', async () => {
      await addTransaction({
        amountMinor: -60_000,
        description: 'Last year',
        postedAt: new Date('2025-10-15T12:00:00Z'),
      });

      expect(await evaluate({ largeTransactionMinor: 50_000 })).toHaveLength(0);
    });

    it('does nothing at all when the threshold is off', async () => {
      await addTransaction({ amountMinor: -60_000, description: 'A new laptop' });
      expect(await evaluate()).toHaveLength(0);
    });
  });

  describe('connections', () => {
    async function addConnection(input: {
      status: string;
      lastError: string | null;
      updatedAt?: Date;
    }) {
      const rows = await db
        .insert(connections)
        .values({
          userId,
          adapterId: 'simplefin',
          name: 'SoFi',
          credentialCiphertext: 'v1:test',
          status: input.status,
          lastError: input.lastError,
          updatedAt: input.updatedAt ?? NOW,
        })
        .returning({ id: connections.id });
      return rows[0]!.id;
    }

    it('speaks up when a connection fails, once for that attempt', async () => {
      await addConnection({ status: 'error', lastError: 'The token expired.' });

      const raised = await evaluate();
      expect(raised).toHaveLength(1);
      expect(raised[0]?.title).toBe('SoFi stopped syncing');
      expect(raised[0]?.body).toContain('The token expired.');

      expect(await evaluate()).toHaveLength(0);
    });

    it('speaks again when the next attempt fails', async () => {
      const id = await addConnection({ status: 'error', lastError: 'The token expired.' });
      await evaluate();

      await db
        .update(connections)
        .set({ updatedAt: new Date('2026-10-16T09:00:00Z') })
        .where(eq(connections.id, id));

      expect(await evaluate()).toHaveLength(1);
    });

    it('stays quiet about a connection that is fine', async () => {
      await addConnection({ status: 'active', lastError: null });
      expect(await evaluate()).toHaveLength(0);
    });
  });

  describe('subscriptions', () => {
    async function addItem(input: {
      name: string;
      amountMinor: number;
      nextDate: string;
      priceChanged?: boolean;
      previousAmountMinor?: number | null;
      status?: string;
    }) {
      const rows = await db
        .insert(recurringItems)
        .values({
          userId,
          key: `key-${input.name}`,
          merchantName: input.name,
          cadence: 'monthly',
          status: input.status ?? 'confirmed',
          amountMinor: input.amountMinor,
          currency: 'USD',
          occurrences: 3,
          nextDate: input.nextDate,
          priceChanged: input.priceChanged ?? false,
          previousAmountMinor: input.previousAmountMinor ?? null,
        })
        .returning({ id: recurringItems.id });
      return rows[0]!.id;
    }

    it('mentions a bill that is due soon, once per date', async () => {
      await addItem({ name: 'Netflix', amountMinor: 1_999, nextDate: '2026-10-17' });

      const raised = await evaluate();
      expect(raised).toHaveLength(1);
      expect(raised[0]?.title).toBe('Netflix is due in 2 days');

      expect(await evaluate()).toHaveLength(0);
    });

    it('does not mention one that is far away or long gone', async () => {
      await addItem({ name: 'Later', amountMinor: 1_000, nextDate: '2026-11-20' });
      await addItem({ name: 'Forgotten', amountMinor: 1_000, nextDate: '2026-08-01' });

      expect(await evaluate()).toHaveLength(0);
    });

    it('mentions a price change and a due date separately', async () => {
      await addItem({
        name: 'Spotify',
        amountMinor: 1_199,
        nextDate: TODAY,
        priceChanged: true,
        previousAmountMinor: 999,
      });

      const raised = await evaluate();
      expect(raised.map((alert) => alert.title).sort()).toEqual([
        'Spotify changed price',
        'Spotify is due today',
      ]);
    });

    it('says nothing about a dismissed subscription', async () => {
      await addItem({ name: 'Not mine', amountMinor: 1_000, nextDate: TODAY, status: 'dismissed' });
      expect(await evaluate()).toHaveLength(0);
    });
  });

  describe('the webhook', () => {
    const draft = {
      kind: 'sync' as const,
      title: 'SoFi stopped syncing',
      body: 'The connection said: The token expired.',
      href: '/connections',
      dedupeKey: 'sync:one:2026-10-15',
    };

    it('sends what has not been sent, and marks it sent', async () => {
      await createAlert(db, userId, draft);
      const sent: string[] = [];

      const result = await deliverAlerts(db, userId, {
        url: 'https://ntfy.example/money',
        baseUrl: 'https://money.example',
        now: NOW,
        send: async (_url, request) => {
          sent.push(request.body);
          return { ok: true, status: 200 };
        },
      });

      expect(result).toEqual({ sent: 1, failed: 0 });
      expect(sent[0]).toContain('SoFi stopped syncing');
      expect(sent[0]).toContain('https://money.example/connections');

      const rows = await listAlerts(db, userId);
      expect(rows[0]?.notifiedAt).toEqual(NOW);
      expect(rows[0]?.notifyAttempts).toBe(1);

      // Nothing is sent twice.
      const again = await deliverAlerts(db, userId, {
        url: 'https://ntfy.example/money',
        send: async () => ({ ok: true }),
      });
      expect(again).toEqual({ sent: 0, failed: 0 });
    });

    it('keeps a failed one, counts the attempt and tries again', async () => {
      await createAlert(db, userId, draft);

      const first = await deliverAlerts(db, userId, {
        url: 'https://ntfy.example/money',
        send: async () => ({ ok: false, status: 500 }),
      });
      expect(first).toEqual({ sent: 0, failed: 1 });

      let rows = await listAlerts(db, userId);
      expect(rows[0]?.notifiedAt).toBeNull();
      expect(rows[0]?.notifyAttempts).toBe(1);
      expect(rows[0]?.lastNotifyError).toContain('500');

      const second = await deliverAlerts(db, userId, {
        url: 'https://ntfy.example/money',
        maxAttempts: 2,
        send: async () => ({ ok: false, error: 'The address did not answer.' }),
      });
      expect(second.failed).toBe(1);

      rows = await listAlerts(db, userId);
      expect(rows[0]?.notifyAttempts).toBe(2);
      expect(rows[0]?.lastNotifyError).toBe('The address did not answer.');

      // The attempts are spent: it stays in the inbox and is not retried.
      const third = await deliverAlerts(db, userId, {
        url: 'https://ntfy.example/money',
        maxAttempts: 2,
        send: async () => ({ ok: true }),
      });
      expect(third).toEqual({ sent: 0, failed: 0 });
    });
  });
});
