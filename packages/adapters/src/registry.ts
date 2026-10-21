/**
 * Adapter registry.
 *
 * This is the one place where data sources are registered and selected.
 * Adding a new source means writing one adapter and adding one line here.
 */

import type { DataSourceAdapter } from '@moneytracker/core';

import { MockAdapter } from './mock/index.ts';

export type AdapterFactory = (options?: Record<string, unknown>) => DataSourceAdapter;

const registry = new Map<string, AdapterFactory>([['mock', () => new MockAdapter()]]);

/**
 * Registers a data source.
 *
 * @example
 * registerAdapter('csv', () => new CsvAdapter());
 */
export function registerAdapter(id: string, factory: AdapterFactory): void {
  registry.set(id, factory);
}

/**
 * Returns the adapter selected by configuration.
 *
 * @example
 * const adapter = getAdapter('mock');
 */
export function getAdapter(id: string): DataSourceAdapter {
  const factory = registry.get(id);
  if (!factory) {
    throw new Error(
      `Unknown data source "${id}". Registered sources: ${[...registry.keys()].join(', ')}`,
    );
  }
  return factory();
}

/** Lists the registered data source ids. */
export function listAdapters(): string[] {
  return [...registry.keys()];
}
