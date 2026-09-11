# Domain docs

How skills should consume this repo's domain documentation when exploring the codebase.

## Status

The project has no architecture yet. `CONTEXT.md` and `docs/adr/` do not exist, and there is no `src/` structure to describe. Revisit this file once the initial architecture is decided: confirm the layout below still fits and add anything the chosen structure needs.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary and domain model
- **`docs/adr/`** — architectural decision records that touch the area you're about to work in

If either is missing, **proceed silently**. Don't flag the absence or suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Intended layout

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   └── 0001-<decision>.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary avoids.

If the concept isn't in the glossary yet, either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, say so explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
