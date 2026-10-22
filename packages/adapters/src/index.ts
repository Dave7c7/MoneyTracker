/**
 * @moneytracker/adapters - data sources.
 *
 * Adapters produce normalized data and nothing else. They never write to the
 * database and never know which application is consuming them.
 */

export * from './registry.ts';
export * from './mock/index.ts';
export * from './csv/index.ts';
export * from './simplefin/index.ts';
export {
  DEFAULT_ANCHOR,
  DEFAULT_MONTHS,
  DEFAULT_SEED,
  generateMockData,
  MOCK_ACCOUNTS,
  type MockDataOptions,
  type MockDataset,
} from './mock/generator.ts';
