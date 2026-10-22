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
| 3. Transfers, splits, CSV import | Done | Transfers are linked and kept out of the totals, a charge can be split across categories, and a bank export is imported with a saved mapping profile |
| 4. Subscriptions, bills, budgets, net worth | Done | Recurring charges are found and confirmed, bills can be added by hand, budgets per category, net worth over time, savings goals |
| 5. Live bank connection | Started | The connection and its encrypted credential are in place; the provider trial is open, see [PROVIDER-TRIAL.md](PROVIDER-TRIAL.md) |
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

### On your phone

A phone on the same network reaches the app through your machine's address,
for example `http://192.168.1.20:3000`.

**The development server only answers to the hosts it knows about.** The
allowed addresses are in `apps/web/next.config.ts` (`allowedDevOrigins`), and
the private ranges are already listed. If the page loads but nothing works —
no charts, and the amber "the scripts of the app did not load" message at the
top — the dev server refused that address: add it to `allowedDevOrigins` and
restart `pnpm dev`.

**For the real build, publish it on the network.** The app binds to
`localhost` by default, on purpose:

```bash
BIND_ADDRESS=0.0.0.0 docker compose up --build    # reachable from your phone
```

**Watch out for two servers on port 3000.** On macOS, `localhost` and
`127.0.0.1` can reach different servers: a development server bound to all
interfaces and a Docker container bound to `127.0.0.1` can share the port.
Check with `lsof -nP -iTCP:3000 -sTCP:LISTEN` before you compare the two.

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

They build the app and start it on port 3100, in their own build directory, so
a development server on port 3000 is never disturbed. Set `E2E_PORT` to use
another port, or `E2E_BASE_URL` to point the tests at a server that is already
running.

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
description that names the movement ("transfer", "credit card", "thank you",
"payment received"), are the two sides of one transfer. A credit card payment
counts too: the money leaves checking and arrives on the card. A plain
"payment" or "autopay" is not enough — those are usually ordinary bills — and
a refund never counts.

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

## Importing a file

A bank export is a file, not a format. Every institution names its columns
differently, writes its dates differently, and has its own idea of which sign
means "money left". The app does not guess: you tell it once how to read one
institution's files, and it remembers that.

**You say how the file is laid out.** The import screen reads the file in your
browser, shows its columns, and fills in a first guess from the column names.
You correct what is wrong and save it as a profile: the date column, the
amount column, the description column, the sign convention, the date format,
the decimal separator, the delimiter, and the account the rows belong to. The
next export of the same bank is read the same way.

**You see what will happen before it happens.** The preview gives the row
count, the date range, how many rows are already in the app, how many could
not be read and why, which columns are not used, which accounts will be
created, and the first rows as the app read them.

**The same file never becomes two.** Every row of a file gets an id derived
from its account, date, amount and description, so importing the same export
again updates the rows that are already there instead of making new ones. Two
charges that look identical on the same day stay two charges.

**The rows land like any other.** An imported file goes through the same
rules, the same merchant memory and the same transfer detection as a bank
connection, so a transfer between two of your accounts is found in a file too.

---

## Splits

One charge can be more than one thing: a hotel bill that is also dinner, a shop
run that is groceries and household. The app lets you say so.

**The row the bank gave you stays as it is.** A split adds parts next to the
transaction. The amount, the date and the description are still the bank's,
and the transaction still shows up in the list as one thing.

**The parts add up to the whole.** The editor says how much is left before
you save, and it will not save a split that does not add up. Two halves and
three parts are one tap away when the numbers are awkward.

**Every part counts under its own category.** The spending chart, the totals
and the cash flow all see the parts, so a charge that is half groceries and
half dinner is counted as exactly that. The total does not change; the
categories do.

**A split is your decision.** Like a manual edit, it is locked: no rule, no
re-categorization run and no later import moves it. Taking the split away
gives the transaction back to the pipeline.

---

## Subscriptions and bills

The app finds what it can, and the user decides what is real.

**A recurring charge is a rhythm.** The same merchant, three or more charges,
amounts within ten percent, and a regular cadence: weekly, monthly or
annual. Everything else is a one-off, and a merchant whose amounts are all
over the place is not a subscription either.

**A price change is a step, not a wobble.** When the older charges and the
newer ones sit at different levels, and the newer ones agree with each other,
the price went up and the app says so. A utility bill that is a little
different every month is a bill, not a price change.

**Your decision is final.** A confirmed charge is kept, a dismissed one is
never brought back, and a bill the app has not found can be added by hand
with the day it lands.

**The app says what it costs.** The monthly and yearly cost of everything
recurring, and what is due in the next 30 days.

---

## Budgets and goals

**A budget is a limit you set.** One amount per category per month. The app
shows what was spent against it, what is left, and when the limit is passed.
Money that was not spent can roll over into the next month, if you want it to.

**A goal is tracking only.** The app never moves money. A goal has a target
and a deadline, and its progress is either what you say you set aside or the
balance of an account you link it to. When there is a deadline, the app says
what has to be saved each month to get there.

---

## Live bank connections

A live connection is one provider account: its own credential, its own refresh
rhythm, its own history window. Many of them live in one install, and every
account belongs to exactly one of them.

**The credential is encrypted before it is stored.** A provider token is a
password for the transactions, so it is encrypted with AES-256-GCM and the key
comes from `ENCRYPTION_KEY`. The app never shows it and never returns it from
a read.

**One failing connection never blocks another.** Each connection records its
own status and its own error, and the error never contains the credential.

**The provider is chosen by a trial, not by an assumption.** The plan puts an
evaluation gate before any code: check the price, the terms and the coverage,
write the answer down in `DECISIONS.md`, and only then write the adapter. The
trial, and what is known today, is in [PROVIDER-TRIAL.md](PROVIDER-TRIAL.md).

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
| `ENCRYPTION_KEY` | – | 32-byte key (hex) for encrypting stored provider credentials, required once a live connection is added |
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
