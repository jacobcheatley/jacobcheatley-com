# One app with flat routes, not a monorepo

Projects hosted on the site are mostly standalone but may share components and services, which suggested a monorepo (`apps/` + `packages/`). We chose a single TanStack Start app: each Project lives at a flat top-level route (`/arg`, `/some-project`), shared code lives in ordinary folders, and pathless layout routes organise the source without changing URLs. A monorepo earns its ceremony only when a Project needs a different runtime or framework; until then it is cost without benefit.
