# AGENTS.md

Guidance for any AI coding agent working in this repo. Read this first, then `PLAN.md` and `rules/*.md`.

## Project

Self-hostable personal finance tracker: multi-account transaction aggregation, dashboards, and transparent, correctable categorization. Works on phone and desktop as a PWA. Single user first; family sharing possible later.

## Stack (defaults, change only via `docs/DECISIONS.md`)

- TypeScript everywhere, strict mode
- Next.js (App Router) as a PWA, Tailwind for styling
- PostgreSQL, Drizzle ORM with migrations
- Zod for validation at every boundary
- Vitest for unit tests, Playwright for a few end-to-end flows
- Docker Compose: `app` + `db`. One command to run locally and on a server
- Charts: Recharts

## Commands

- `docker compose up`: run the full stack
- `pnpm dev`: dev server
- `pnpm test`: unit tests (must pass before every commit)
- `pnpm lint && pnpm typecheck`: must be clean before every commit
- `pnpm db:migrate`: apply migrations
- `pnpm seed`: load mock data

## Hard rules (summary; details in `rules/`)

1. **Money is integers.** Store amounts in minor units (cents) as integers. Never use floats for money.
2. **Everything outside the app core goes through an adapter.** Data sources, aggregators, and any LLM provider are swappable interfaces.
3. **User rules beat automatic guesses.** Always. See `rules/categorization.md`.
4. **Every category assignment is explainable.** Store the source and reason with it.
5. **Imports are idempotent.** Re-importing the same data creates no duplicates.
6. **Transfers and card payments are not spending.** See `rules/data-and-money.md`.
7. **No secrets in code, logs, or git.** See `rules/security.md`.
8. **Never scrape or store raw bank passwords.** Use aggregator tokens or file imports only.
9. **Tests ship with features.** See `rules/testing.md`.

## Working style

- Small, reviewable changes. One concern per commit.
- Prefer boring, readable code over clever code.
- Do not add dependencies without a one-line justification in the commit message.
- If a requirement is ambiguous and the choice is costly to reverse, ask. Otherwise decide, record it in `docs/DECISIONS.md`, and continue.
- Out of scope, do not build: bill negotiation, subscription cancellation concierge, credit score. See `PLAN.md`.

## Repo layout

```
apps/web/            Next.js app (UI + API routes)
packages/core/       Domain logic: categorization, rules, transfers, subscriptions, budgets
packages/adapters/   Data source adapters: mock, csv, sofi/aggregator
packages/db/         Schema, migrations, seed
docs/                DECISIONS.md and notes
rules/               Binding rules for agents
```
