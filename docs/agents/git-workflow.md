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

The rule above covers one self-contained change. A feature that graduates into a chain of dependent tickets — a spec's tickets that block one another, say — lands as a **stack** of PRs: two or more PRs where the bottom one targets the trunk (`main`) and each PR above targets the branch of the PR below it, so a later PR can build on code that hasn't merged yet. It's first-class on GitHub: branch protection and CI are enforced on every PR in the stack, and each is reviewed independently.

Two behaviours make this cheap, and neither needs manual rebasing:

- **Merges go bottom-up.** You can merge the whole stack, one PR, or a span, but never above an unmerged PR. When a PR merges, GitHub **automatically rebases the remaining branches** so the next one retargets `main`. Squash is a supported method — use it, and the history matches squash-merging each PR from the bottom.
- **Edits low in the stack cascade up.** Change a lower branch and a restack rebases everything above it onto the new parent automatically.

Drive it with the `gh stack` CLI (`gh extension install github/gh-stack`):

- `gh stack init [branches...]` — start a stack on `main`, adopting existing branches bottom-to-top.
- `gh stack add <branch>` — add a branch on top.
- `gh stack submit` — push every branch and create/update its PR and the stack on GitHub.
- `gh stack sync` / `gh stack rebase` — cascade-rebase after a lower branch changes or the trunk moves.
- `gh stack merge` — merge up to the chosen PR in one all-or-nothing operation, choosing the merge method. `protect-main-merges` and other rules are evaluated at merge (stacks can't bypass them).

Constraints: all branches live in the same repo (no cross-fork stacks), each still follows the `type/<ticket>-<short-name>` grammar, and every PR still lands on `main` as a squash merge — this extends the squash-merge rule, it doesn't replace it. See GitHub's docs: <https://docs.github.com/en/pull-requests/get-started/about-stacked-prs>.

## Enforcement

`branch-pattern.yml` gates PRs into `main` on the head branch. It skips branches it doesn't own: `dependabot/*` and GitHub's auto-generated `revert-<n>-...` reverts. It checks format only — it does not verify the ticket references a real issue.
