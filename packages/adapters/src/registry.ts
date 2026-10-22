/**
 * Adapter registry.
 *
 * This is the one place where data sources are registered and selected.
 * Adding a new source means writing one adapter and adding one line here.
 */

import type { DataSourceAdapter } from '@moneytracker/core';

import { CsvAdapter, type CsvAdapterOptions } from './csv/index.ts';
import { MockAdapter } from './mock/index.ts';
import { SimpleFinAdapter, claimAccessUrl, type SimpleFinOptions } from './simplefin/index.ts';

export type AdapterFactory = (options?: Record<string, unknown>) => DataSourceAdapter;

/**
 * Exchanges a setup token for the credential the app stores.
 *
 * Only a provider that hands out a setup token has one.
 */
export type ClaimHandler = (setupToken: string) => Promise<string>;

const registry = new Map<string, AdapterFactory>([
  ['mock', () => new MockAdapter()],
  ['csv', (options) => new CsvAdapter(options as unknown as CsvAdapterOptions)],
  ['simplefin', (options) => new SimpleFinAdapter(options as unknown as SimpleFinOptions)],
]);

const claims = new Map<string, ClaimHandler>([
  ['simplefin', (setupToken) => claimAccessUrl(setupToken)],
]);

/**
 * Registers a data source.
 *
 * @example
 * registerAdapter('sofi', () => new SoFiAdapter());
 */
export function registerAdapter(id: string, factory: AdapterFactory): void {
  registry.set(id, factory);
}

/**
 * Returns the adapter selected by configuration.
 *
 * @example
 * const adapter = getAdapter('mock');
 * const csv = getAdapter('csv', { content, mapping, accountKey, accountName, accountType, currency });
 */
export function getAdapter(id: string, options?: Record<string, unknown>): DataSourceAdapter {
  const factory = registry.get(id);
  if (!factory) {
    throw new Error(
      `Unknown data source "${id}". Registered sources: ${[...registry.keys()].join(', ')}`,
    );
  }
  return factory(options);
}

/** Lists the registered data source ids. */
export function listAdapters(): string[] {
  return [...registry.keys()];
}

/**
 * Registers how a data source is connected with a setup token.
 *
 * @example
 * registerClaim('mybank', (setupToken) => claimAccessUrl(setupToken));
 */
export function registerClaim(id: string, handler: ClaimHandler): void {
  claims.set(id, handler);
}

/**
 * Exchanges a setup token for the credential of a provider.
 *
 * The token is given to the app by the user, and it only works once.
 *
 * @example
 * const accessUrl = await claimFor('simplefin', setupToken);
 */
export async function claimFor(id: string, setupToken: string): Promise<string> {
  const claim = claims.get(id);
  if (!claim) {
    throw new Error(`The data source "${id}" cannot be connected with a setup token.`);
  }
  return claim(setupToken);
}
