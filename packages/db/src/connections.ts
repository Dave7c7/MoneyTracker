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

import type { Database } from './client.ts';
import { connectionAccounts, connections } from './schema.ts';
import { decryptSecret, encryptSecret } from './credentials.ts';

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
