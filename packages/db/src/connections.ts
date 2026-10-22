/**
 * The connection service.
 *
 * A connection is one provider account: it has its own credential, its own
 * refresh rhythm and its own history window. Many connections live in one
 * install, and every account belongs to exactly one of them.
 *
 * The credential is encrypted before it is stored and is never returned by a
 * read: the app never needs to show it.
 */

import { and, asc, eq } from 'drizzle-orm';

import { claimFor, getAdapter } from '@moneytracker/adapters';

import type { Database } from './client.ts';
import { accounts, connectionAccounts, connections } from './schema.ts';
import { decryptSecret, encryptSecret } from './credentials.ts';
import { syncFromAdapter, type SyncResult } from './sync.ts';

/** How a connection is doing. */
export type ConnectionStatus = 'active' | 'error' | 'disabled';

/** A connection, as the app shows it. The credential is not part of it. */
export interface ConnectionRow {
  id: string;
  adapterId: string;
  name: string;
  institution: string | null;
  status: ConnectionStatus;
  lastSyncedAt: Date | null;
  lastError: string | null;
  historyDays: number;
  refreshHours: number;
  /** The accounts this connection feeds. */
  accountIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** What the user sets when adding a connection. */
export interface ConnectionInput {
  /** Which provider serves this connection, e.g. "simplefin". */
  adapterId: string;
  name: string;
  institution?: string | null;
  /** The provider's token. It is encrypted before it is stored. */
  credential: string;
  /** How far back this provider can reach, in days. */
  historyDays?: number;
  /** How often the provider refreshes, in hours. */
  refreshHours?: number;
  /** The accounts this connection feeds. */
  accountIds?: string[];
}

/**
 * Lists the connections of the user.
 *
 * @example
 * const connections = await listConnections(db, userId);
 */
export async function listConnections(db: Database, userId: string): Promise<ConnectionRow[]> {
  const rows = await db
    .select({
      id: connections.id,
      adapterId: connections.adapterId,
      name: connections.name,
      institution: connections.institution,
      status: connections.status,
      lastSyncedAt: connections.lastSyncedAt,
      lastError: connections.lastError,
      historyDays: connections.historyDays,
      refreshHours: connections.refreshHours,
      createdAt: connections.createdAt,
      updatedAt: connections.updatedAt,
    })
    .from(connections)
    .where(eq(connections.userId, userId))
    .orderBy(asc(connections.createdAt));

  const links = await db
    .select({
      connectionId: connectionAccounts.connectionId,
      accountId: connectionAccounts.accountId,
    })
    .from(connectionAccounts)
    .where(eq(connectionAccounts.userId, userId));

  return rows.map((row) => ({
    ...row,
    status: row.status as ConnectionStatus,
    accountIds: links.filter((link) => link.connectionId === row.id).map((link) => link.accountId),
  }));
}

/**
 * Adds a connection and stores its credential encrypted.
 *
 * @example
 * await createConnection(db, userId, {
 *   adapterId: 'simplefin', name: 'SoFi checking', credential: token,
 * });
 */
export async function createConnection(
  db: Database,
  userId: string,
  input: ConnectionInput,
  keyHex: string,
): Promise<ConnectionRow | null> {
  const rows = await db
    .insert(connections)
    .values({
      userId,
      adapterId: input.adapterId,
      name: input.name.trim(),
      institution: input.institution ?? null,
      credentialCiphertext: encryptSecret(input.credential, keyHex),
      historyDays: input.historyDays ?? 90,
      refreshHours: input.refreshHours ?? 24,
    })
    .returning({ id: connections.id });

  const id = rows[0]?.id;
  if (!id) return null;

  for (const accountId of input.accountIds ?? []) {
    await linkAccount(db, userId, id, accountId);
  }

  const all = await listConnections(db, userId);
  return all.find((connection) => connection.id === id) ?? null;
}

/**
 * Links an account to a connection.
 *
 * An account belongs to one connection, so linking it to another one moves
 * it rather than duplicating it.
 *
 * @example
 * await linkAccount(db, userId, connectionId, accountId);
 */
export async function linkAccount(
  db: Database,
  userId: string,
  connectionId: string,
  accountId: string,
): Promise<void> {
  await db
    .insert(connectionAccounts)
    .values({ userId, connectionId, accountId })
    .onConflictDoUpdate({
      target: connectionAccounts.accountId,
      set: { connectionId, createdAt: new Date() },
    });
}

/**
 * Reads the credential of a connection.
 *
 * This is the only way to get the token, and it is called by the sync, never
 * by a screen.
 *
 * @example
 * const token = await readCredential(db, userId, connectionId, keyHex);
 */
export async function readCredential(
  db: Database,
  userId: string,
  connectionId: string,
  keyHex: string,
): Promise<string | null> {
  const rows = await db
    .select({ credentialCiphertext: connections.credentialCiphertext })
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.userId, userId)))
    .limit(1);

  const stored = rows[0]?.credentialCiphertext;
  if (!stored) return null;
  return decryptSecret(stored, keyHex);
}

/**
 * Records how a sync went.
 *
 * The message never contains the credential: the app only ever writes what
 * the provider said about the connection.
 *
 * @example
 * await recordSyncResult(db, userId, connectionId, { ok: false, error: 'Token expired' });
 */
export async function recordSyncResult(
  db: Database,
  userId: string,
  connectionId: string,
  result: { ok: true } | { ok: false; error: string },
): Promise<void> {
  await db
    .update(connections)
    .set({
      status: result.ok ? 'active' : 'error',
      lastSyncedAt: result.ok ? new Date() : null,
      lastError: result.ok ? null : result.error,
      updatedAt: new Date(),
    })
    .where(and(eq(connections.id, connectionId), eq(connections.userId, userId)));
}

/**
 * Removes a connection.
 *
 * The accounts it fed stay in the app; they are simply no longer refreshed.
 *
 * @example
 * await deleteConnection(db, userId, connectionId);
 */
export async function deleteConnection(
  db: Database,
  userId: string,
  connectionId: string,
): Promise<boolean> {
  const rows = await db
    .delete(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.userId, userId)))
    .returning({ id: connections.id });
  return rows.length > 0;
}

/**
 * The accounts a connection feeds, with the id the provider knows them by.
 */
export async function listLinkedAccounts(
  db: Database,
  userId: string,
  connectionId: string,
): Promise<{ id: string; externalId: string; name: string }[]> {
  const rows = await db
    .select({
      id: accounts.id,
      externalId: accounts.externalId,
      name: accounts.name,
    })
    .from(connectionAccounts)
    .innerJoin(accounts, eq(accounts.id, connectionAccounts.accountId))
    .where(
      and(eq(connectionAccounts.userId, userId), eq(connectionAccounts.connectionId, connectionId)),
    );

  return rows;
}

/**
 * Connects a provider with the setup token the user was given.
 *
 * The token is exchanged for a credential, the credential is stored encrypted,
 * and the connection is kept. The accounts behind it are listed separately,
 * so the user can pick the ones to keep.
 *
 * @example
 * const connection = await claimConnection(db, userId, {
 *   adapterId: 'simplefin', setupToken, historyDays: 365,
 * }, key);
 */
export async function claimConnection(
  db: Database,
  userId: string,
  input: {
    adapterId: string;
    setupToken: string;
    name?: string;
    institution?: string | null;
    historyDays?: number;
    refreshHours?: number;
  },
  keyHex: string,
): Promise<ConnectionRow> {
  const credential = await claimFor(input.adapterId, input.setupToken);

  const created = await createConnection(
    db,
    userId,
    {
      adapterId: input.adapterId,
      name: input.name?.trim() || input.adapterId,
      institution: input.institution ?? null,
      credential,
      historyDays: input.historyDays ?? 90,
      refreshHours: input.refreshHours ?? 24,
    },
    keyHex,
  );

  if (!created) throw new Error('The connection could not be stored.');
  return created;
}

/** An account a provider can reach, as the app shows it. */
export interface ProviderAccount {
  externalId: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor: number | null;
}

/**
 * The accounts behind a connection, so the user can pick the ones to keep.
 *
 * @example
 * const accounts = await listProviderAccounts(db, userId, connectionId, key);
 */
export async function listProviderAccounts(
  db: Database,
  userId: string,
  connectionId: string,
  keyHex: string,
): Promise<ProviderAccount[]> {
  const connection = (await listConnections(db, userId)).find((entry) => entry.id === connectionId);
  if (!connection) throw new Error('That connection does not exist.');

  const accessUrl = await readCredential(db, userId, connectionId, keyHex);
  if (!accessUrl) throw new Error('That connection has no credential.');

  const adapter = getAdapter(connection.adapterId, {
    accessUrl,
    historyDays: connection.historyDays,
  });
  const [list, balances] = await Promise.all([
    adapter.fetchAccounts(),
    adapter.fetchBalances?.() ?? Promise.resolve([]),
  ]);

  const balanceById = new Map(
    balances.map((balance) => [balance.accountExternalId, balance.balanceMinor]),
  );

  return list.map((account) => ({
    externalId: account.externalId,
    name: account.name,
    type: account.type,
    currency: account.currency,
    balanceMinor: balanceById.get(account.externalId) ?? null,
  }));
}

/**
 * Syncs one connection.
 *
 * The credential is read, the adapter is built for the accounts this
 * connection owns, and the data goes through the same pipeline as everything
 * else: the same rules, the same merchant memory, the same transfer
 * detection. A failure is recorded on the connection and never blocks the
 * other connections.
 *
 * @example
 * const result = await syncConnection(db, userId, connectionId, keyHex);
 */
export async function syncConnection(
  db: Database,
  userId: string,
  connectionId: string,
  keyHex: string,
): Promise<SyncResult> {
  const connection = (await listConnections(db, userId)).find((entry) => entry.id === connectionId);
  if (!connection) throw new Error('That connection does not exist.');

  const accessUrl = await readCredential(db, userId, connectionId, keyHex);
  if (!accessUrl) throw new Error('That connection has no credential.');

  const linked = await listLinkedAccounts(db, userId, connectionId);

  // A later sync only asks for what is new, with a few days of overlap so
  // nothing that was posted late is missed.
  const since = connection.lastSyncedAt ?? null;

  try {
    const adapter = getAdapter(connection.adapterId, {
      accessUrl,
      accountExternalIds: linked.map((account) => account.externalId),
      historyDays: connection.historyDays,
      since: since ?? undefined,
    });
    const result = await syncFromAdapter({ db, adapter, userId, since: since ?? undefined });
    await recordSyncResult(db, userId, connectionId, { ok: true });
    return result;
  } catch (error) {
    await recordSyncResult(db, userId, connectionId, {
      ok: false,
      error: error instanceof Error ? error.message : 'The sync failed.',
    });
    throw error;
  }
}

/**
 * Links the accounts of a provider to a connection, and brings them in.
 *
 * The accounts are imported first, because the app can only link an account
 * it knows.
 *
 * @example
 * await linkConnectionAccounts(db, userId, connectionId, ['CON-1:2930002'], keyHex);
 */
export async function linkConnectionAccounts(
  db: Database,
  userId: string,
  connectionId: string,
  externalIds: readonly string[],
  keyHex: string,
): Promise<SyncResult> {
  const connection = (await listConnections(db, userId)).find((entry) => entry.id === connectionId);
  if (!connection) throw new Error('That connection does not exist.');

  const accessUrl = await readCredential(db, userId, connectionId, keyHex);
  if (!accessUrl) throw new Error('That connection has no credential.');

  let result: SyncResult;
  try {
    const adapter = getAdapter(connection.adapterId, {
      accessUrl,
      accountExternalIds: externalIds,
      historyDays: connection.historyDays,
    });
    result = await syncFromAdapter({ db, adapter, userId });
  } catch (error) {
    await recordSyncResult(db, userId, connectionId, {
      ok: false,
      error: error instanceof Error ? error.message : 'The sync failed.',
    });
    throw error;
  }

  // The accounts the provider knows are now in the app, so they can be
  // linked to the connection that feeds them.
  for (const externalId of externalIds) {
    const rows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.adapterId, connection.adapterId),
          eq(accounts.externalId, externalId),
        ),
      )
      .limit(1);

    const accountId = rows[0]?.id;
    if (!accountId) continue;

    await linkAccount(db, userId, connectionId, accountId);
  }

  await recordSyncResult(db, userId, connectionId, { ok: true });
  return result;
}

/**
 * Syncs every connection, one at a time.
 *
 * One connection that fails does not stop the others: the failure is
 * recorded on that connection and the run goes on.
 *
 * @example
 * const outcome = await syncAllConnections(db, userId, keyHex);
 */
export async function syncAllConnections(
  db: Database,
  userId: string,
  keyHex: string,
): Promise<{ synced: number; failed: number }> {
  const all = await listConnections(db, userId);
  let synced = 0;
  let failed = 0;

  for (const connection of all) {
    if (connection.status === 'disabled') continue;
    try {
      await syncConnection(db, userId, connection.id, keyHex);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
}
