# MoneyTracker

A self-hostable personal finance tracker. It aggregates transactions across
bank and credit card accounts, shows dashboards, and categorizes every
transaction in a way you can inspect, correct and explain.

Works on a phone and a desktop as an installable PWA. Single user first.

---

## What is in here

| Phase | Status | What you can do |
|---|---|---|
| 0. Foundations | Done | Monorepo, Postgres schema and migrations, Docker Compose, config validation |
| 1. Mock data and dashboards | Done | Demo dataset, PWA shell, overview/spending/cash-flow/transactions/accounts screens |
| 2. Categorization, rules, review inbox | Done | Fix a category, write a rule, clear the review inbox, undo anything |
| 3. Transfers, splits, CSV import | In progress | Transfer detection is done: transfers are linked, badged and kept out of the totals |
| 4. Subscriptions, bills, budgets, net worth | Planned | Recurring charge detection and budget tracking |
| 5. Live bank connection | Planned | A new adapter behind the same interface |
| 6. Hardening and extras | Planned | Auth, alerts, backups, export |

The plan and the binding rules live in `PLAN.md`, `AGENTS.md` and the rule
files in the repository root.

---

## Running it

### With Docker (recommended)

```bash
cp .env.example .env          # optional: change the database password
docker compose up             # app on http://localhost:3000
```

`docker compose up` starts the database, applies the migrations and starts the
app with an empty database.

To load the demo dataset (13 months of realistic transactions across three
accounts):

```bash
docker compose --profile demo up
```

The app is published on `localhost:3000` only. Put a reverse proxy in front of
it for HTTPS; see [Security](#security) below.

### Without Docker

You need Node 22+, pnpm and a PostgreSQL 16 database.

```bash
pnpm install
cp .env.example .env          # point DATABASE_URL at your database
pnpm db:migrate               # create the schema
pnpm db:seed                  # optional: load the demo dataset
pnpm dev                      # http://localhost:3000
```

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the web app in development mode |
| `pnpm build` / `pnpm start` | Build and run the production app |
| `pnpm test` | Run the unit tests (and the database tests when `TEST_DATABASE_URL` is set) |
| `pnpm e2e` | Run the end-to-end tests (needs `pnpm e2e:install` once) |
| `pnpm lint` / `pnpm typecheck` | Lint and type check everything |
| `pnpm check` | `test` + `lint` + `typecheck`, the gate before every commit |
| `pnpm db:generate` | Generate a migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Load the demo dataset (safe to run twice) |
| `pnpm db:reset` | Wipe and re-seed a scratch database (refuses a non-test URL) |
| `pnpm db:studio` | Open Drizzle Studio to browse the data |

The database integration tests need a scratch database:

```bash
TEST_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test pnpm test
```

The end-to-end tests run against a seeded database and check the dashboards at
three widths: 360px (the narrowest the app supports), 448px (a Pixel 10 Pro
XL) and desktop.

The categorization tests change data, so point them at a scratch database. It
is reset before every run:

```bash
createdb moneytracker_e2e
export E2E_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_e2e
pnpm e2e:install   # once, downloads the browser
pnpm e2e
```

To look at the app the way each device sees it:

```bash
node apps/web/scripts/screenshot.mjs http://localhost:3000
```

---

## Continuous integration

Every push to `main` and every pull request runs `.github/workflows/ci.yml`:

- **check** starts Postgres 16, creates `moneytracker_test`, migrates it, and
  runs `pnpm check` (tests, lint, typecheck).
- **e2e** starts after that, creates `moneytracker_e2e`, and runs the Playwright
  suite against the phone, Pixel and desktop projects. The Playwright report is
  uploaded as an artifact when a run fails.

The workflow does the same things as the commands above, so a green run locally
means a green run in CI.

---

## Architecture

```
apps/web            Next.js App Router UI, API routes, PWA shell
packages/core       Pure domain logic: money, dates, merchants, rules, categorization, dashboards
packages/adapters   Data sources behind one interface: mock today, csv and live later
packages/db         Schema, migrations, the sync service, queries
```

The rules the code follows:

- **Money is always an integer** number of minor units (cents). Floats never
  touch money. Formatting happens once, at the edge, with `Intl.NumberFormat`.
- **Adapters are the only way in.** `DataSourceAdapter` has one method set:
  accounts, transactions, balances. Adding a source means writing one
  adapter; no other file changes.
- **The UI never touches the database.** Pages call `lib/data.ts`, which uses
  the query layer and the aggregation functions in `core`.
- **Every categorization is explainable.** Each assignment stores its source
  (`user_manual`, `user_rule`, `merchant_memory`, `bank`, `ai`, `fallback`), a
  confidence and a human-readable reason.
- **Manual edits are locked.** Re-categorization never overwrites them.
- **Imports are idempotent.** `(account_id, external_id)` is unique, so
  importing the same data twice creates no duplicates, and a pending
  transaction becomes posted rather than appearing twice.

---

## Categorization

The app is built around the idea that you can see why a transaction was
categorized the way it was, and change it in two taps.

**Every assignment carries a reason.** The line under a transaction says where
the category came from: a rule you wrote, a choice you made before, the bank's
guess, or nothing at all.

**Your rules beat everything.** A rule matches on merchant, description
pattern, amount range or account, and the first rule in the list wins. Creating
or changing a rule re-categorizes the transactions it can reach and tells you
how many changed. Manual edits are never touched: the count of "manual edit
left alone" is always reported next to the number of changes.

**The review inbox is the fast path.** Transactions the app is not sure about
are grouped by merchant, so one decision clears dozens of them. It can be
cleared with the keyboard (`j`/`k` to move, `enter` to confirm, `x` to select,
`u` to undo) or with taps, and every bulk edit can be undone.

**Corrections stick.** After you change a category, the app asks whether to
apply it to the whole merchant, or to that merchant within an amount range. Both
write a rule, so the decision holds for future imports too.

---

## Transfers

Money that moves between your own accounts is not spending, and the app treats
it that way.

**Transfers are found, not guessed.** Two transactions on two of your accounts
with the same amount, opposite signs, no more than three days apart, and a
description that reads like a payment, are the two sides of one transfer. A
credit card payment counts too: the money leaves checking and arrives on the
card.

**They stay visible.** A transfer keeps its place in the transaction list with
a `Transfer` badge, and the explanation says which transaction on which
account it was matched with.

**They never count as spending.** Both sides get the `Transfer` category, so
the spending chart, the cash flow and the totals all leave them out.

**A transfer without a partner asks for attention.** If a payment arrives with
no matching transaction on another account, the app keeps it out of the totals
and puts it in the review inbox as a *possible transfer*, so you can confirm it
or decide what it really was.

**You always have the last word.** Every row has a `Mark as transfer` button,
and a transfer that is already marked can be turned back into an ordinary
transaction. Changing a category by hand also takes the transaction out of its
transfer group.

---

## Configuration

Every setting is an environment variable, validated at startup with Zod. Copy
`.env.example` to `.env`; the file is git-ignored and the app refuses to start
with a missing or malformed value.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | – | Postgres connection string (required) |
| `APP_TIMEZONE` | `UTC` | Timezone used for monthly buckets |
| `DEFAULT_CURRENCY` | `USD` | Currency used when an account has none |
| `DEFAULT_LOCALE` | `en-US` | Locale for number formatting |
| `ADAPTER_ID` | `mock` | Which data source to read from |
| `REVIEW_CONFIDENCE_THRESHOLD` | `0.8` | Assignments below this go to the review inbox |
| `DEFAULT_USER_EMAIL` / `DEFAULT_USER_NAME` | `you@example.com` / `Me` | The local user |
| `ENCRYPTION_KEY` | – | 32-byte key for encrypting stored credentials (Phase 5) |
| `AI_CATEGORIZER_ENABLED` | `false` | Optional AI categorizer, off by default |

Bank-provided categories are capped at 0.7 confidence, so with the default
threshold of 0.8 they land in the review inbox. Lower
`REVIEW_CONFIDENCE_THRESHOLD` to 0.65 if you would rather trust them.

---

## Security

This app holds financial data. Treat it as sensitive.

- **Secrets never enter the repository.** `.env` is git-ignored; only
  `.env.example` is committed, with placeholders.
- **No bank passwords, ever.** Data arrives through an aggregator token or a
  file import.
- **The database is not published.** Compose exposes it only to the internal
  network, and the app binds to `localhost`.
- **The container runs as a non-root user** with a read-only filesystem, all
  capabilities dropped and `no-new-privileges` set.
- **Account numbers are masked.** Only the last four digits are stored or
  shown.
- **Every input is validated** with Zod, and every query is parameterized.

Before exposing the app to the internet:

1. Put it behind a reverse proxy with HTTPS (Caddy, nginx, Traefik).
2. Set a strong `POSTGRES_PASSWORD`.
3. Back up the database: `docker compose exec db pg_dump -U moneytracker moneytracker > backup.sql`.
4. When Phase 5 lands, generate the encryption key with `openssl rand -hex 32`
   and store it in your secret manager, not in the image or the repo.

---

## Development notes

- The mock dataset is deterministic: a fixed seed, so tests and seeded
  databases always match. It deliberately contains transfers, card payments,
  refunds, pending charges, duplicate-looking charges, messy merchant names,
  recurring subscriptions, a price increase and an annual charge.
- Dashboards are computed in `packages/core`, never in components. The
  aggregation functions are pure and unit tested against hand-checked
  fixtures.
- `packages/core` imports nothing from `apps/` or `packages/db`, and never
  touches the network.
