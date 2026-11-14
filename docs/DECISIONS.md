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

## 2026-10-25 — CSRF protection via SameSite=Lax, not tokens

The session cookie is `SameSite=Lax`, which prevents cross-origin POST requests
from carrying the cookie. This stops most CSRF attacks: a malicious page cannot
submit forms to the app and have them authenticated.

`SameSite=Lax` does not protect against attacks from subdomains of the same
site (e.g., if an attacker controls `evil.yourdomain.com`). A full CSRF token
system would cover that case, but it adds complexity (token generation, storage,
validation on every form) that is disproportionate for a single-user self-hosted
app where subdomain attacks are unlikely.

**Cost:** an attacker who controls a subdomain could perform authenticated
actions. In the expected deployment (a home server with no subdomains, or a VPS
with the app on its own domain), this is not a realistic threat.

## 2026-11-04 — A public MoneyTracker landing page in front of the finance app

The root route is a public, MoneyTracker-specific product landing page. The
existing finance overview moved to `/overview`; route groups give the landing
page and finance app separate shells without discarding any finance routes or
authentication.

Three.js is confined to a client-only dynamic hero import. Native CSS, pointer
events and scroll handlers cover the other effects, so GSAP is not needed. All
imagery and copy describe MoneyTracker accounts, categorization, cash flow,
budgets and goals; the page contains no placeholder designer content.

**Cost:** overview links and end-to-end fixtures use `/overview`, and the public
landing artwork under `/images` bypasses the session gate just like the icons.

## 2026-11-14 — One product design system with two color schemes

The finance app adopts the landing page's Space Grotesk and IBM Plex Mono
typography, lime accent, fine borders and layered surfaces. Semantic CSS tokens
in `globals.css` provide light and dark variants from the OS preference. Shared
`finance-*` primitives carry the system into cards, statistics, navigation,
forms and account settings; a `PageHeader` supplies a common heading rhythm.

The finance shell stays data-first. Category colors still come from their
stored values and palette helpers, semantic success/warning/error colors stay
distinct, and Three.js remains confined to the marketing hero. No component
framework, theme provider or new dependency is added.

**Cost:** older finance screens can still contain local Tailwind surface colors
until the dashboard and workflow refinement phases migrate them. Both color
schemes and desktop/mobile navigation placement are covered by Playwright.

## 2026-11-14 — Shared finance chart presentation

Dashboard charts keep Recharts and their existing data contracts. Shared axis,
legend and tooltip primitives in `components/charts/chart-ui.tsx` apply the
finance typography, borders and surfaces. Cash flow uses green for income, rose
for expenses and violet for net; net worth uses the accent area/line treatment.
Category colors still come from stored values and palette helpers, never from
chart position or theme.

Numeric summaries and table alternatives remain beside the charts. The net
worth visualization changes from a plain line to an area/line chart without
changing its points, and spending/cash-flow legends use theme-readable text
instead of category-colored labels.

**Cost:** chart presentation is shared but chart composition stays local.
Playwright covers every chart route, overflow on all viewports and the actual
spending tooltip on desktop.

## 2026-11-14 — Finance workflows use the same visual contract

Transactions, review, rules, imports, connections, budgets, goals,
subscriptions and alerts now use the shared page hierarchy, surfaces, inputs,
buttons, badges and notices. Compact `finance-input--small`,
`finance-button--small` and `finance-button--tiny` variants keep dense editing
rows compact instead of applying login-sized controls everywhere.

This is a presentation migration only. Existing labels, roles, IDs, button
names, conditional rendering, keyboard shortcuts, API payloads, list ordering
and toast positioning are unchanged. Specialized category menus, read/unread
alerts and safe-area-aware undo toasts retain their own behavior and semantics.

**Cost:** a few workflow-specific visual states remain intentionally distinct.
Playwright covers all workflow behavior plus every page in both color schemes
at phone, Pixel and desktop widths.
