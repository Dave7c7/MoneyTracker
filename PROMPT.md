# Kickoff prompt

Paste this into your coding agent (Claude Code, Cursor, etc.) after placing these files in the repo root.

---

You are building a personal finance tracker. Before writing any code, read `AGENTS.md`, `PLAN.md`, and every file in `rules/`. They are binding.

**Product.** A self-hostable, cross-device (responsive PWA) app that aggregates transactions across bank and credit card accounts and shows rich dashboards. Its differentiator is categorization that is transparent and learns from my corrections. Data starts as mock data, then CSV import, then a live SoFi connection through an aggregator.

**How to work.**
1. Work one phase at a time, in the order in `PLAN.md`. Do not start a phase until the previous phase's "Done when" checklist passes.
2. At the start of each phase, post a short plan (files to create, tests to write, open questions) and wait for my OK only if something is ambiguous. Otherwise proceed.
3. Build behind the interfaces in `rules/architecture.md`. The app must never know which data source it is reading from.
4. Write tests with the code, not after. Categorization and money logic need unit tests before the UI exists.
5. Commit in small steps with clear messages. Never commit secrets.
6. When a decision is not covered by the rules, choose the simplest option, record it in `docs/DECISIONS.md` with one line of reasoning, and continue.

**Start now with Phase 0 and Phase 1.** When done, summarize what was built, how to run it (`docker compose up`), and what you assumed.
