/**
 * The savings goal service.
 *
 * A goal is tracking only: the app never moves money. The user sets a target
 * and a deadline, and either says what they have set aside or links the goal
 * to an account the app reads the balance of.
 */

import { and, desc, eq } from 'drizzle-orm';

import type { SavingsGoal } from '@moneytracker/core';

import type { Database } from './client.ts';
import { accounts, balanceSnapshots, savingsGoals } from './schema.ts';

/** A goal as it is stored, with the account it is linked to. */
export interface SavingsGoalRow extends SavingsGoal {
  accountName: string | null;
  /** The latest balance of the linked account, when there is one. */
  accountBalanceMinor: number | null;
}

/** What the user can set. */
export interface SavingsGoalInput {
  name: string;
  targetMinor: number;
  savedMinor?: number;
  accountId?: string | null;
  deadline?: string | null;
}

/**
 * Lists the goals of the user.
 *
 * @example
 * const goals = await listSavingsGoals(db, userId);
 */
export async function listSavingsGoals(db: Database, userId: string): Promise<SavingsGoalRow[]> {
  const rows = await db
    .select({
      id: savingsGoals.id,
      name: savingsGoals.name,
      targetMinor: savingsGoals.targetMinor,
      savedMinor: savingsGoals.savedMinor,
      accountId: savingsGoals.accountId,
      accountName: accounts.name,
      deadline: savingsGoals.deadline,
    })
    .from(savingsGoals)
    .leftJoin(accounts, eq(accounts.id, savingsGoals.accountId))
    .where(eq(savingsGoals.userId, userId))
    .orderBy(savingsGoals.createdAt);

  const snapshots = await db
    .select({
      accountId: balanceSnapshots.accountId,
      balanceMinor: balanceSnapshots.balanceMinor,
    })
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.userId, userId))
    .orderBy(desc(balanceSnapshots.asOf));

  const latestByAccount = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (!latestByAccount.has(snapshot.accountId)) {
      latestByAccount.set(snapshot.accountId, snapshot.balanceMinor);
    }
  }

  return rows.map((row) => ({
    ...row,
    accountBalanceMinor: row.accountId ? (latestByAccount.get(row.accountId) ?? null) : null,
  }));
}

/**
 * Adds a goal.
 *
 * @example
 * await createSavingsGoal(db, userId, { name: 'Emergency fund', targetMinor: 500_000 });
 */
export async function createSavingsGoal(
  db: Database,
  userId: string,
  input: SavingsGoalInput,
): Promise<SavingsGoalRow | null> {
  const rows = await db
    .insert(savingsGoals)
    .values({
      userId,
      name: input.name.trim(),
      targetMinor: input.targetMinor,
      savedMinor: input.savedMinor ?? 0,
      accountId: input.accountId ?? null,
      deadline: input.deadline ?? null,
    })
    .returning({ id: savingsGoals.id });

  const goals = await listSavingsGoals(db, userId);
  return goals.find((goal) => goal.id === rows[0]?.id) ?? null;
}

/**
 * Changes a goal.
 *
 * @example
 * await updateSavingsGoal(db, userId, id, { savedMinor: 12_000 });
 */
export async function updateSavingsGoal(
  db: Database,
  userId: string,
  id: string,
  input: Partial<SavingsGoalInput>,
): Promise<SavingsGoalRow | null> {
  const changes: Partial<typeof savingsGoals.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) changes.name = input.name.trim();
  if (input.targetMinor !== undefined) changes.targetMinor = input.targetMinor;
  if (input.savedMinor !== undefined) changes.savedMinor = input.savedMinor;
  if (input.accountId !== undefined) changes.accountId = input.accountId;
  if (input.deadline !== undefined) changes.deadline = input.deadline;

  const rows = await db
    .update(savingsGoals)
    .set(changes)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .returning({ id: savingsGoals.id });

  if (rows.length === 0) return null;
  const goals = await listSavingsGoals(db, userId);
  return goals.find((goal) => goal.id === id) ?? null;
}

/**
 * Removes every goal, so the database is the way it was found.
 *
 * @example
 * await removeSavingsGoals(db, userId);
 */
export async function removeSavingsGoals(db: Database, userId: string): Promise<void> {
  await db.delete(savingsGoals).where(eq(savingsGoals.userId, userId));
}

/**
 * Removes a goal.
 *
 * @example
 * await deleteSavingsGoal(db, userId, id);
 */
export async function deleteSavingsGoal(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .returning({ id: savingsGoals.id });
  return rows.length > 0;
}
