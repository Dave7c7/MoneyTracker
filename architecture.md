# Architecture rules

## Layers

```
UI (apps/web)  →  API routes  →  core (packages/core)  →  db (packages/db)
                                      ↑
                          adapters (packages/adapters)
```

- `core` contains pure domain logic. It does not import from `apps/web`, and does not call the network.
- `adapters` produce normalized data. They never write to the database directly; the sync service does.
- UI never talks to the database or an adapter directly.

## The adapter interface (most important design decision)

```ts
interface DataSourceAdapter {
  id: string;                                   // "mock" | "csv" | "sofi-plaid" ...
  fetchAccounts(): Promise<NormalizedAccount[]>;
  fetchTransactions(accountId: string, since?: Date): Promise<NormalizedTransaction[]>;
  fetchBalances?(): Promise<NormalizedBalance[]>;
}

interface NormalizedTransaction {
  externalId: string;        // stable ID from the source; derive a deterministic hash if none
  accountId: string;
  postedAt: Date | null;     // null while pending
  pending: boolean;
  amountMinor: number;       // integer cents; negative = money out, positive = money in
  currency: string;          // ISO 4217
  descriptionRaw: string;    // exactly as the source gave it
  merchantRaw?: string;
  sourceCategory?: string;   // bank-provided, if any
}
```

Rules:
1. Adding a new data source means writing one adapter. No other file should change.
2. Adapters return data in the normalized shape above and nothing else. No source-specific fields leak out.
3. Keep `descriptionRaw` untouched. Cleaned merchant names live in a separate field.
4. Adapters are registered in one place (`adapters/registry.ts`) and selected by config.

## Optional AI/LLM categorizer

- Behind an interface: `Categorizer.suggest(tx, context): Promise<{categoryId, confidence, reason}>`.
- Off by default. Enabled by config. Provider is swappable (cloud or local model).
- Sends only the minimum fields needed (cleaned merchant, description, amount range). Never account numbers, balances, or user names.
- Output is validated with Zod. Invalid output is treated as "no suggestion".

## Config

- All config via environment variables, validated at startup with Zod. Fail fast with a clear message.
- Same build runs self-hosted or in the cloud. No hardcoded hosts or paths.
- Provide `.env.example` with every variable documented and no real values.

## Decisions

Record any non-obvious choice in `docs/DECISIONS.md` as: date, decision, one-line reason.
