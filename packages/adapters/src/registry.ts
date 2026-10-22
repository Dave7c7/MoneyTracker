/**
 * Adapter registry.
 *
 * This is the one place where data sources are registered and selected.
 * Adding a new source means writing one adapter and adding one line here.
 */

import type { DataSourceAdapter } from '@moneytracker/core';

import { CsvAdapter, type CsvAdapterOptions } from './csv/index.ts';
import { MockAdapter } from './mock/index.ts';

export type AdapterFactory = (options?: Record<string, unknown>) => DataSourceAdapter;

const registry = new Map<string, AdapterFactory>([
  ['mock', () => new MockAdapter()],
  ['csv', (options) => new CsvAdapter(options as unknown as CsvAdapterOptions)],
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
