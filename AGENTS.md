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
- `pnpm test`: unit and database tests (must pass before every commit)
- `pnpm lint && pnpm typecheck`: must be clean before every commit
- `pnpm check`: everything CI runs — tests, lint, typecheck, Prettier, and the migration guard
- `pnpm db:check-migrations`: fail if the schema and the generated migrations disagree
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
10. **Never edit or overwrite** '.env'.It was wiped twice.
11. **Never hand-write migrations; only pnpm db:generate.** CI fails when the schema and the generated migrations disagree.
12. **Dev uses host Postgres and the container uses its own volume.**
13. **Docker owns port 3000, and pnpm dev is the fast loop.**
14. **`pnpm test` sets its own database up.** Never create, migrate or configure the test database by hand; see [The test database](#the-test-database). One run at a time.

## The test database

**Nothing to configure.** `pnpm test` creates the scratch database if it is
missing, applies the migrations, runs, and releases its lock. A fresh machine
needs Postgres on `localhost:5432` and `pnpm install`, nothing else.

| What | Value |
|---|---|
| Database | `moneytracker_test` on `localhost:5432`, user `moneytracker` |
| Override | `TEST_DATABASE_URL` — the name must end in `_test`, `_test2`, `_e2e` and so on, or the setup refuses to run |
| Prepare by hand | `pnpm db:test:setup` (creates, migrates, says what it found) |
| Run everything | `pnpm test` (unit + database) |
| Run only the database tests | `pnpm test --project db` |

**The end-to-end suite works the same way.** `pnpm e2e` uses `moneytracker_e2e`
on the same server, creates and migrates it, and resets it before every run.
Override with `E2E_DATABASE_URL`.

**Only one run at a time per database.** The database tests empty tables between
cases, so two runs on one database destroy each other's fixtures and produce a
wall of failures that look like broken code. A Postgres advisory lock prevents
it: the second run stops before the first test with

```
Error: The tests are already running against moneytracker_test. ...
```

Wait for the other run, or give the second one a database of its own:

```bash
TEST_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test2 \
  pnpm test
```

The setup creates that database and migrates it on the way in, so the only thing
to choose is the name.

**A crashed run frees its lock by itself.** The lock belongs to a connection, so
there is nothing to clean up by hand. If you ever see the message with no other
run in sight, the holder is a live process:

```bash
psql postgresql://moneytracker:moneytracker@localhost:5432/postgres \
  -c "select pid, datname, state from pg_stat_activity where datname like 'moneytracker%';"
```

**Why this exists.** A fresh agent once ran the suite while another run was in
flight and met thirty-eight failures with no hint of the cause. The lock and the
default database are the fix for that hour.

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
