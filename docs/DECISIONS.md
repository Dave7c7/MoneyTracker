# Decisions

Short records of choices that are expensive to reverse or confusing without the
reason. Newest last. Each says what was decided, why, and what it costs.

## 2026-10-22 — Signing in with a password, not a magic link

A self-hosted install may have no mail server, so an emailed link can leave the
owner locked out of their own app. The app therefore asks for one password, set
on the first visit, and stores only a scrypt hash with a random salt.

**Cost:** no password recovery by email. The server owner sets it with
`pnpm db:set-password`, which is a terminal away.

## 2026-10-22 — The cookie holds a random token; the database holds its hash

The browser gets a random token. The `sessions` table stores only its SHA-256,
so a stolen database cannot be turned into a sign-in, and signing out deletes
the row so a copied cookie stops working.

**Cost:** every request reads the session row. One row per request is cheaper
than a copy of the database being a set of working cookies.

## 2026-10-22 — The `Secure` flag follows the request, not the build

A home install is reached over plain HTTP on the local network; the same build
behind a proxy is HTTPS. Marking the cookie `Secure` on plain HTTP makes the
browser discard it, and the user is signed out on every request with no error.
So the flag is set when the request arrived over HTTPS, `X-Forwarded-Proto`
included.

**Cost:** on an install that is reachable over the internet without TLS, the
cookie is not protected. The README says HTTPS is the operator's job; the app
cannot do it for them.

## 2026-10-22 — `pnpm test` provisions its own database

A hand-made scratch database and a variable that was easy to leave stale cost an
agent an hour of thirty-eight failures that looked like broken code. Now the
test database has a default (`moneytracker_test`), the run creates and migrates
it, and a Postgres advisory lock keeps two runs apart. The name must end in
`_test` or `_e2e` so a stray variable cannot empty the development database.

**Cost:** the first run on a machine needs Postgres on `localhost:5432` and the
`moneytracker` role. Nothing else, and no setting to remember.

## 2026-10-22 — Recognising a bank export is data, not code

The importer knows a handful of column signatures (`packages/core/src/bank-exports.ts`).
A signature fills in the mapping and names the profile after the bank. Files
that are not recognised keep the old behaviour: guess from the column names, and
save whatever the user corrects.

A signature must be specific enough that it does not claim another bank's file,
because a false badge presets the sign of every amount. That is why the SoFi
card export is deliberately not recognised.

**Cost:** a new bank is a small entry in a table, not a feature; and a bank that
changes its columns falls back to the guess instead of breaking.

## 2026-10-23 — Rate limits per address, in memory

Sign-in, setup, password change and email change are limited per client
address: 20 tries in 5 minutes to sign in, 5 in 15 minutes to claim the first
password, 10 in 15 minutes to change either. A success clears the count.

The counters live in the server process, not in a table: the app runs one
process for one household, and a restart clearing them is cheaper than a
migration and a cleanup job.

The address is the first entry of `X-Forwarded-For`, which Next.js fills from
the socket only when the client did not send the header. Behind a proxy that
sets it, the limit follows the real client; directly exposed, a client can write
its own value and step around it. That is deliberate: the account pause (five
wrong passwords, fifteen minutes) is the defence against guessing, and this is a
guard on the machine's time. Making the header trustworthy would need a proxy
allow-list, which is a setting to get wrong on a home install.

**Cost:** one process per install. A deployment with several app instances
would count each instance separately; that is not the shape of this app.

## 2026-10-23 — Exports are a read; backups are a file

The account screen downloads the transactions as CSV (decimal amounts, one row
each) and as JSON (minor units, accounts, categories and split lines). Neither
touches the database, so an export can never change what it exports.

The full backup is `pg_dump` through `pnpm db:backup`: one gzipped SQL file,
named after the minute, written 0600, pruned to the newest fourteen. The
connection travels in libpq's environment variables rather than the command
line, because a password in `argv` is a password in `ps`.

A restore drops and recreates the schema, so it runs in one transaction with
`ON_ERROR_STOP`: a failed restore leaves the old database in place. The test
suite takes a backup and restores it on every run, because a backup nobody has
restored is a hope.

**Cost:** `pg_dump` and `psql` have to exist on the machine that runs the
commands. In the container the README gives the `docker compose exec` form
instead, which uses the tools in the database container.

## 2026-10-23 — Two-factor is TOTP, stored encrypted, with hashed recovery codes

The second factor is a six-digit code from an authenticator app (RFC 6238), not
an email or an SMS: a self-hosted install may have no mail server, and a phone
number is a third party in the sign-in path. The algorithm is thirty lines of
HMAC, so it is written here rather than added as a dependency.

The secret is encrypted with `ENCRYPTION_KEY` before it is stored and the
recovery codes are stored as SHA-256 hashes. A backup of the database is
therefore not a way in: without the key the secret is noise, and the codes are
gone. The cost is that two-factor cannot be turned on until the key is set; the
screen says so and refuses rather than storing a secret in the open.

A code is accepted for its own thirty-second step and one step either side, and
the last accepted step is kept on the user, so a code that was seen or used
cannot be used again. A wrong code counts as a failed sign-in and runs into the
same five-try pause as a wrong password.

The setup returns eight recovery codes once; only their hashes are kept, and
each is spent when used. They exist because a phone is lost at the worst time,
and a self-hosted app has no support desk to call.

## 2026-10-23 — Alerts are checked by a command, deduplicated by the fact

The app has no scheduler: the sync already needs `cron`, and alerts use the same
door. `pnpm db:check-alerts` looks at budgets, connections, large charges and
subscriptions, stores what it finds, and posts the new ones to
`ALERT_WEBHOOK_URL`. Running it twice is free.

Every alert carries a key built from the fact it describes — the budget, month
and level; the connection and the moment of the failed attempt; the
transaction; the subscription and the new price; the subscription and the due
date. A unique index on `(user_id, dedupe_key)` means the checker does not have
to remember what it said, and a restarted or replayed run cannot double a
sentence. A fact that changes (a worse budget, a new failed attempt, another
price) is a new key, and speaks again.

The webhook is one plain-text POST with a summary and a link, plus the
`Title`, `Tags` and `Click` headers ntfy reads. Discord and Slack need their
own JSON shape; a relay script is a smaller thing to maintain than a setting
per service, and the alert is in the app either way. Deliveries are attempted
five times and the error is kept on the row, so a quiet phone is visible in the
inbox rather than lost.

**Cost:** nobody is told about anything until cron runs, and a webhook URL is
in `.env` rather than the database — one household, one process, and the token
stays out of the backups.

## 2026-10-23 — A webhook gets a summary, not a statement of your finances

The usual webhook is a topic on public `ntfy.sh`, so the message is readable by
the service and anyone who learns the topic name. Sending "Acme Store: $1,204"
there would hand a third party the merchant, the amount and the date. The
webhook therefore carries only the kind of event — a budget needs attention, a
connection stopped syncing, a large transaction was posted, a recurring charge
needs attention — and a link into the app. The inbox keeps the full sentence.

**Cost:** the notification is less useful on its own; the person has to open the
app to see which budget or which charge. A private topic or a self-hosted ntfy
is still the recommendation, because the topic name is the secret even when the
message is dull.

## Deferred upgrades

Known and deliberately not done yet. Do them on their own, before the release
that removes the old behaviour — not in the middle of a feature.

- **Next.js 16: `middleware.ts` is deprecated in favour of `proxy.ts`.** The
  build warns on every run. The current file only checks the session cookie and
  the rename does not change behaviour, so it can wait; when it is done, rename
  the file and export `proxy` instead of `middleware`, then confirm that the
  login redirect still works and that a stale cookie does not bounce.
