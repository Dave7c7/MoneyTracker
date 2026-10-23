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
| 5. Live bank connection | Done | A read-only SimpleFIN connection: paste a setup token, pick the accounts, and the transactions come in |
| 6. Hardening and extras | Started | A password to open the app, a session that can be ended, and a way back in from the server |
  
Rules directory created for agent guidance:
- `rules/categorization.md` - Categorization rules
- `rules/security.md` - Security rules
- `rules/data-and-money.md` - Data and money rules
- `rules/testing.md` - Testing rules

The plan and the binding rules live in `PLAN.md`, `AGENTS.md` and the rule
files in the `rules/` directory.

---

## Running it

### With Docker (recommended)

```bash
cp .env.example .env          # optional: change the database password
docker compose up             # app on http://localhost:3000
```

`docker compose up` starts the database, applies the migrations and starts the
app with an empty database. **The first visit asks you to choose a password** —
the app starts closed, so nothing is readable until you do.

To load the demo dataset (13 months of realistic transactions across three
accounts):

```bash
docker compose --profile demo up
```

The app is published on `localhost:3000` only. Put a reverse proxy in front of
it for HTTPS; see [Security](#security) below.

**The container keeps its own data.** Compose gives the database a named volume
(`db-data`), which lives with the containers rather than with this checkout. The
development server talks to the database in `.env` instead, so the two do not
share data. To move one into the other:

```bash
# the development database into the container
pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists \
  | docker compose exec -T db psql -U moneytracker -d moneytracker

# and back out again
docker compose exec -T db pg_dump -U moneytracker moneytracker > backup.sql
```

### Without Docker

You need Node 22+, pnpm and a PostgreSQL 16 database.

```bash
pnpm install
cp .env.example .env          # point DATABASE_URL at your database
pnpm db:migrate               # create the schema
pnpm db:seed                  # optional: load the demo dataset
pnpm dev                      # http://localhost:3000
```

`pnpm dev` is the development loop: it watches the source and reloads, and it
talks to the database in `.env`. The container is how the app runs for real —
same code, production build, its own database volume.

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
| `pnpm db:set-password` | Set the password from the server (asks twice, echoes nothing) |
| `pnpm db:sync` | Sync every bank connection (put it in cron) |
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

## Where the money went

The overview opens with a donut of the month's spending, by category group,
and a legend under it that says the same thing in words.

**A group keeps its colour.** The colour belongs to the category, so changing
the month or filtering never repaints a slice. The categories inside a group
use its hue, a little lighter each, so a group and what is inside it are
clearly the same family. Red is never a category: it is reserved for spending
that went up and for a budget that was passed.

**Tapping opens, and then it takes you to the list.** Tap a group and the
donut shows the categories inside it, with the total of that group in the
middle; tap a category and you land on the transactions of that category, in
the same month.

**Six slices, and the rest is "Other".** The folded slice is gray, it can be
opened like any other, and it shows the groups that were folded into it.

**Every number is in the legend.** The chart is the picture; the legend is
the truth, it works with a keyboard, and a screen reader reads the same thing.

---

## Signing in

**The app starts closed.** The first visit asks for a password; after that,
every page and every API route needs it. There is no open registration, so an
address on the network that finds the app cannot claim it: until you set the
password, it is a page asking for one.

**One password, stored as a hash.** It is hashed with scrypt, with a random
salt, so the database never holds the password and two people with the same
password get different hashes. scrypt is deliberately slow and memory hungry,
which is what makes guessing expensive.

**The account screen is where it changes.** The `Account` link in the header
leads to the address you sign in with, the password, and the machines that are
signed in. Changing either asks for the current password, because a session left
open somewhere should not be able to move the account out from under you.
Changing the password signs every other machine out.

**The cookie does not contain the token the database knows.** The browser gets
a random token; the `sessions` table stores only its SHA-256. A copy of the
database cannot be turned into a working sign-in, and signing out deletes the
row, so a copied cookie stops working the moment you sign out.

**A wrong password cannot be tried forever.** Five wrong tries in a row pause
sign-in for fifteen minutes, and a wrong password takes the same time to refuse
whether the email exists or not.

**Forgotten passwords are recovered on the server.** There is no email to reset
with; the person who runs the server sets it:

```bash
pnpm db:set-password                      # asks twice, echoes nothing
printf '%s' 'new password' | pnpm db:set-password   # from a script
```

Setting a password signs every session out.

**HTTPS is still your job.** A reverse proxy in front of the app is what makes
the password travel over TLS. The session cookie is marked `Secure` only when
the request really arrived over HTTPS, so a phone on a home network works over
plain HTTP while a proxy on the internet gets the safer cookie.

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

## Getting the data out of SoFi

**The app never takes your SoFi password.** That is a hard rule of this
project, and it is also what keeps the app from breaking every time SoFi changes
a login screen: a bank password behind a scraper is a password in a database
that cannot be audited. So there are two ways in, and both are features of the
app.

### 1. The CSV export (free, works today)

1. Sign in at **sofi.com** in a browser. The mobile app does not offer the
   export.
2. Open the account: **Banking** for checking or savings, **Credit Card** for
   the card.
3. Open **Documents** (or Statements) and export the transactions as **CSV**.
4. Drop the file on **Import** in this app.

**A SoFi checking or savings export is recognised.** The app sees the columns,
says *"Looks like a SoFi Checking or savings export"*, and fills in the mapping:
month-first dates, money out already negative, and `Type` left out because it
says how the money moved rather than what it was for. The profile is named after
the bank, so the next export is one tap.

**The credit card export is not in the recognition table.** Its columns vary,
and a signature loose enough to catch it would claim every other bank's file
too. The app guesses instead, you correct the sign of the amounts once, and the
profile remembers it.

**Two years at most, one account at a time.** SoFi caps an export at a two-year
range, so older history needs its own export. The importer is idempotent: the
overlap between two exports does not become two sets of rows.

### 2. A connection (automatic, needs the provider)

On **Connections**, paste a SimpleFIN setup token and pick the SoFi accounts.
The transactions then arrive on a schedule (`pnpm db:sync`, or the container's
sync endpoint) with no file in between. The provider holds the bank connection;
this app holds an encrypted, read-only token and never your password.

SimpleFIN's SoFi coverage is worth checking on their side before paying: the
provider notes in [PROVIDER-TRIAL.md](PROVIDER-TRIAL.md) say it is unconfirmed.
If SoFi is not covered, the CSV export is the way, and it costs nothing.

**Both routes land in the same place.** Every row goes through the same rules,
the same merchant memory and the same transfer detection, so a SoFi row imported
from a file and one that arrives from a provider are indistinguishable
afterwards.

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

**The provider is SimpleFIN.** The user connects their bank at
[SimpleFIN](https://bridge.simplefin.org), gets a setup token, and pastes it
into the app. The app exchanges the token for a read-only access URL. The
bank password never reaches the app, and the user can revoke the access at
SimpleFIN at any time.

**The connections are refreshed by a command.** A self-hosted app has no
scheduler of its own, so the sync is something you run:

```bash
# from the repository, against the database in .env
pnpm db:sync
17 7 * * *  cd /app && pnpm db:sync >> /var/log/moneytracker-sync.log 2>&1

# against the containers (no checkout needed: the image has the source)
docker compose run --rm migrate pnpm db:sync
17 7 * * *  cd /srv/moneytracker && docker compose run --rm migrate pnpm db:sync
```

**The credential is encrypted before it is stored.** A provider token is a
password for the transactions, so it is encrypted with AES-256-GCM and the key
comes from `ENCRYPTION_KEY`. The app never shows it and never returns it from
a read. Losing the key means the stored credentials cannot be read any more,
so keep it with your other secrets.

**The limits are known and the app is built around them.** One request covers
at most 90 days, so the history is fetched in slices; the data is refreshed
about once a day, so the app shows when the last sync was; and a source that
never reports a pending transaction is a normal source.

**One failing connection never blocks another.** Each connection records its
own status and its own error, and the error never contains the credential.

**The trial that chose it, and what is known today, is in
[PROVIDER-TRIAL.md](PROVIDER-TRIAL.md).**

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
