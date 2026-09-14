# jacobcheatley.com

Personal website for fun projects and learning

## Tech Stack

- TypeScript
- React + TanStack Start
- DB: Neon
- Hosted: Docker in Fly.io
- Other stuff as we figure it out

## Secret scanning

A pre-commit hook scans staged changes with [gitleaks](https://github.com/gitleaks/gitleaks) and blocks the commit if a secret is found. `bun install` wires it up (via `core.hooksPath`); install the binary once:

```sh
# macOS
brew install gitleaks
# Linux
go install github.com/gitleaks/gitleaks/v8@latest   # or grab a release binary
```

The hook fails if `gitleaks` isn't on PATH. Emergency bypass: `git commit --no-verify`.

## Moderating production

Run the owner CLI against prod without a credential on disk:

```sh
DATABASE_URL="$(npx neon@latest connection-string --project-id cold-recipe-98352824 --branch production)" bun run sticky-notes
```
