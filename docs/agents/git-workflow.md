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

The rule above covers one self-contained change. A feature that graduates into a chain of dependent tickets — a spec's tickets that block one another, say — lands as a **stack** of PRs instead: each ticket's PR branches off the previous ticket's branch, not `main`, so a later PR can build on code that hasn't merged yet.

This extends the squash-merge rule; it doesn't replace it:

- While the stack is open, each PR's base is the branch below it, so its diff shows only that ticket's own changes.
- Merge bottom-up: squash-merge the lowest PR into `main` first, then rebase the rest of the stack onto the new `main` and retarget the next PR's base to `main`. Repeat up the stack. Every PR still squash-merges into `main`.
- Each branch still follows the `type/<ticket>-<short-name>` grammar; the stack is only how they're chained.

Manage the stack with the `gh stack` CLI — building the chain, keeping each PR's base correct, and restacking after a merge or a rebase.

## Enforcement

`branch-pattern.yml` gates PRs into `main` on the head branch. It skips branches it doesn't own: `dependabot/*` and GitHub's auto-generated `revert-<n>-...` reverts. It checks format only — it does not verify the ticket references a real issue.
