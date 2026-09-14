# Domain docs

How skills should consume this repo's domain documentation when exploring the codebase.

## Status

Architecture decided 2026-09-12 (wayfinder map, issue #1). `CONTEXT.md` (glossary: Project, Portfolio) and `docs/adr/0001–0003` exist. The `src/` layout below is the one chosen in issue #14 and built by the scaffold spec in issue #15.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary and domain model
- **`docs/adr/`** — architectural decision records that touch the area you're about to work in

If either is missing, **proceed silently**. Don't flag the absence or suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Layout

Single-context repo. One feature folder per Project plus a thin route file; folder names use the glossary.

```
/
├── CONTEXT.md
├── docs/adr/
├── src/
│   ├── routes/            file-based routes at flat URLs; _shell.* is the pathless Portfolio layout
│   ├── portfolio/         landing-page components
│   ├── projects/<name>/   schema.ts, *.server.ts, *.fn.ts, components, colocated tests
│   ├── db/index.server.ts the only reader of DATABASE_URL
│   └── test/              Vitest global setup and helpers
├── e2e/                   Playwright smoke
├── scripts/               owner CLIs run with `bun run <name>` (sticky-notes approval)
└── server.ts              Bun.serve wrapper (canonical host, assets, future WebSocket seam)
```

Conventions (file roles, tests, seams policy) live alongside the Layout above and in the relevant `docs/adr/` records.

## Use the glossary's vocabulary

When your output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary avoids.

If the concept isn't in the glossary yet, either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, say so explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
