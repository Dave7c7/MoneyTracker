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
