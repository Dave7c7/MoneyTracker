# Security and privacy rules

This app holds sensitive financial data. Assume it will be exposed to the internet eventually.

## Credentials and secrets

- Never store, log, or ask for a user's raw bank username or password. Use aggregator tokens (OAuth-style) or file imports.
- Aggregator access tokens are **encrypted at rest** (AES-256-GCM) with a key from env/secret manager. Key is never in the DB or git.
- `.env` is git-ignored. Only `.env.example` is committed, with placeholders.
- No secrets in logs, error messages, analytics, or client bundles. Add a log-redaction helper and use it.

## Data handling

- Treat these as sensitive: account numbers, balances, transaction descriptions, tokens. Mask account numbers in the UI (last 4 only).
- Database volume and backups are encrypted or documented as requiring disk encryption.
- Provide data export and full delete from the UI.
- LLM/AI categorizer (if enabled) receives only minimal fields (cleaned merchant, description, amount bucket). Never account numbers, balances, or personal names. Default is off; enabling requires an explicit setting.

## Auth (Phase 6, but design for it from Phase 0)

- Every API route checks authentication and authorization. Even in single-user mode, scope all queries by `user_id` so multi-user is not a rewrite.
- Passwords hashed with argon2id. Prefer passkeys; support TOTP.
- Secure, httpOnly, sameSite cookies. CSRF protection on mutations.
- Rate limit login and sync endpoints.

## Web hardening

- Validate all input with Zod. Parameterized queries only (ORM or prepared statements).
- Set CSP, HSTS, X-Content-Type-Options, and Referrer-Policy headers.
- Sanitize CSV imports: cap file size, reject formula-injection prefixes (`=`, `+`, `-`, `@`) when exporting CSV.
- Dependencies: lockfile committed, no unpinned `latest`, run `pnpm audit` in the check script.

## Self-hosting

- Ship a hardened `docker-compose.yml`: non-root user, read-only filesystem where possible, DB not exposed on a public port, healthchecks.
- README documents: HTTPS via reverse proxy, backups, updating, and rotating the encryption key.

## Checklist before Phase 6 is "done"

- [ ] No secrets in repo history (`git log -p` scan)
- [ ] Tokens encrypted at rest
- [ ] All routes authenticated and user-scoped
- [ ] Logs reviewed for sensitive data
- [ ] Export and delete-all work
- [ ] Backup and restore tested once
