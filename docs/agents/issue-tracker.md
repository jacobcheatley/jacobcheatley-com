# Issue tracker: GitHub

Issues live as GitHub Issues on this repo. Use the `gh` CLI for everything; it infers the repo from the git remote.

This is a solo project. There are no external collaborators or reporters: every issue is written by the owner, for the owner, as internal planning state.

## Conventions

- **Create**: `gh issue create --title "..." --body "..."` (heredoc for multi-line bodies)
- **Read**: `gh issue view <number> --comments`
- **List**: `gh issue list --state open --json number,title,body,labels,comments` with `--label` / `--state` filters as needed
- **Comment**: `gh issue comment <number> --body "..."`
- **Label**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## Pull requests

PRs are not a request surface. They exist only for the owner's own feature review and branch management, and never enter the triage queue. A bare `#42` is an issue.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding (`/wayfinder`)

The **map** is one issue; each ticket is a **child** issue.

- **Map**: an issue labelled `wayfinder:map` holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a GitHub sub-issue of the map (sub-issues endpoint via `gh api`). If sub-issues are unavailable, add it to a task list in the map body and put `Part of #<map>` at the top of the child body. Label `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`).
- **Blocking**: native issue dependencies. `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where the id is the blocker's numeric database id (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, not the `#number`). Fallback: a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier**: the map's open children with no open blocker and no assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` before any other write.
- **Resolve**: comment the answer, close the issue, then append a context pointer (gist + link) to the map's Decisions-so-far.
