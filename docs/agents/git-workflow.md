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

## Enforcement

`branch-pattern.yml` gates PRs into `main` on the head branch. It skips branches it doesn't own: `dependabot/*` and GitHub's auto-generated `revert-<n>-...` reverts. It checks format only — it does not verify the ticket references a real issue.
