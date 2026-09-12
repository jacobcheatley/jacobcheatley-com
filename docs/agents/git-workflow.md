# Git workflow

Solo project. Features land on `main` through a PR, squash-merged. The `protect-main-merges` ruleset blocks direct pushes to `main`.

## Branch names

Never a plain name. Always `type/short-name`, with a ticket number for mergeable work:

- **Mergeable types** (`feat` `fix` `docs` `chore` `refactor` `revert` `test`): `type/<ticket>-<short-name>`, e.g. `feat/123-add-cool-page`.
- **Throwaway types** (`prototype` `research`): `type/<short-name>`, ticket optional, e.g. `prototype/color-probe` or `research/42-bun-websockets`. These live out of `main` and are never merged (see the prototype and wayfinder skills).

Rules:

- `<ticket>` is the bare issue number, no `#`.
- `<short-name>` is lowercase letters, digits, single hyphens; starts and ends alphanumeric.
- The type set is closed — CI rejects anything else.

The full grammar as one regex (shared with the CI check in `.github/workflows/branch-pattern.yml`):

```
^((feat|fix|docs|chore|refactor|revert|test)/[0-9]+-[a-z0-9]+(-[a-z0-9]+)*|(prototype|research)/([0-9]+-)?[a-z0-9]+(-[a-z0-9]+)*)$
```

## Stacked PRs

The rule above covers one self-contained change. A feature that graduates into a chain of dependent tickets — a spec's tickets that block one another, say — lands as a **stack** of PRs: a first-class GitHub object where each ticket's PR builds on the branch below it, not on `main`, so a later PR can build on code that hasn't merged yet. Each PR is still reviewed independently with its own checks.

Stacks are managed with the `gh stack` CLI (`gh extension install github/gh-stack`), which removes the manual base-retargeting and bottom-up rebasing entirely:

- `gh stack init [branches...]` — start a stack on `main` (the trunk), adopting existing branches bottom-to-top.
- `gh stack add <branch>` — add a branch on top of the stack.
- `gh stack submit` — push every branch and create/update its PR and the stack on GitHub.
- `gh stack sync` / `gh stack rebase` — cascade-rebase the stack onto its updated parents, so an edit low in the chain propagates up on its own; no per-branch rebasing by hand.
- `gh stack merge` — GitHub's **atomic stack merge**: everything up to the chosen PR merges into `main` in one all-or-nothing operation. Pick **squash** as the merge method to keep the squash-merge rule. Branch protection and the `protect-main-merges` ruleset are evaluated when the merge runs (stacks can't bypass them).

Each branch still follows the `type/<ticket>-<short-name>` grammar. This extends the squash-merge rule, it doesn't replace it: every PR still lands on `main` as a squash merge — the CLI just sequences the merges and rebases for you.

## Enforcement

`branch-pattern.yml` gates PRs into `main` on the head branch. It skips branches it doesn't own: `dependabot/*` and GitHub's auto-generated `revert-<n>-...` reverts. It checks format only — it does not verify the ticket references a real issue.
