# Next.js scaffold facts (verified 2026-09-12)

Answers issue #3. Primary sources only. Package versions are from the npm registry (`npm view <pkg> version`, dates from `npm view <pkg> time`) on 2026-09-12; everything else is cited inline.

## Versions

| Package | Latest stable | Notes |
|---|---|---|
| `next` | 16.3.5 (16.3.0: 2026-08-03) | Node >= 20.9 ([install](https://nextjs.org/docs/app/getting-started/installation#system-requirements)); Turbopack default since 16.0 ([turbopack](https://nextjs.org/docs/app/api-reference/turbopack)) |
| `react`, `react-dom` | 19.3.0 (2026-09-09) | `create-next-app@16.3.5` pins `19.2.8`; App Router ships a bundled React canary regardless ([install](https://nextjs.org/docs/app/getting-started/installation#manual-installation)) |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 (4.3.0: 2026-05-08) | |
| `vitest` | 5.0.0 (2026-09-03) | Node `^22.12 \|\| ^24 \|\| >=26`; `vite >=6.4` is a required peer ([migration](https://vitest.dev/guide/migration)) |
| `@vitejs/plugin-react` | 6.1.1 (6.0.0: 2026-03-12) | peer `vite ^8` (vite latest 8.3.0) |
| `@testing-library/react` | 16.3.3 | peer `@testing-library/dom ^10` (10.4.1) |
| `jsdom` / `happy-dom` | 30.0.1 / 20.14.3 | |
| `@playwright/test` | 1.63.0 (2026-09-04) | |
| `eslint` / `eslint-config-next` | 10.10.0 / 16.3.5 | config peer `eslint >=9`; scaffold pins `^9` |
| `@biomejs/biome` | 2.5.13 | scaffold pins `2.4.2` |
| `typescript` | 7.0.2 (npm `latest`, 2026-07-08) | scaffold pins `^5`; Next runs TS 7 via project-local `tsc` (see Lint) |
| Node.js | 24 Active LTS, 26 Current, 22 Maintenance | [nodejs.org](https://nodejs.org/en/about/previous-releases) |

## create-next-app

Defaults (`--yes`): TypeScript, ESLint, Tailwind, App Router, Turbopack, alias `@/*`, `AGENTS.md` + `CLAUDE.md`. `src/` and React Compiler default to **No**. `--no-<flag>` negates any default ([CLI ref](https://nextjs.org/docs/app/api-reference/cli/create-next-app)).

```bash
npx create-next-app@latest jacobcheatley-com --ts --eslint --tailwind --app --src-dir --turbopack --import-alias "@/*" --no-agents-md
# add --use-npm | --use-pnpm | --use-yarn | --use-bun to force a package manager (otherwise inferred from the invoking PM)
```

Other flags: `--biome` / `--no-linter`, `--react-compiler`, `--webpack`, `--empty`, `--api`, `--skip-install`, `--disable-git`, `--example <name|url>`.

What `16.3.5` generates for TS + Tailwind + App Router ([template source, tag v16.3.5](https://github.com/vercel/next.js/blob/v16.3.5/packages/create-next-app/templates/index.ts), [files](https://github.com/vercel/next.js/tree/v16.3.5/packages/create-next-app/templates/app-tw/ts)):

- `scripts`: `"dev": "next dev"`, `"build": "next build"`, `"start": "next start"`, `"lint": "eslint"`. No `--turbopack` flag needed; `--webpack` is the opt-out.
- deps: `react`/`react-dom` `19.2.8`, `next` (resolved latest). devDeps: `typescript ^5`, `@types/node ^20`, `@types/react ^19`, `@types/react-dom ^19`, `eslint ^9`, `eslint-config-next`, `tailwindcss ^4`, `@tailwindcss/postcss ^4`.
- files: `eslint.config.mjs`, `postcss.config.mjs`, `next.config.ts` (empty `NextConfig`), `tsconfig.json` (`moduleResolution: bundler`, `paths: {"@/*": ["./*"]}` rewritten to `./src/*` with `--src-dir`; `include` has `.next/types/**/*.ts`), `app/globals.css`.
- `--src-dir` moves `app/` (and `pages/`, `styles/`) under `src/`; `public/` and config stay at root.

Canary (unreleased) diverges: Turbopack projects get `@tailwindcss/turbopack` (published 2026-07-31, "A Turbopack loader for Tailwind CSS v4") wired via `turbopack.rules["*.css"].loaders` in `next.config.ts` and no `postcss.config.mjs`; React pinned 19.3.0 ([canary template](https://github.com/vercel/next.js/blob/canary/packages/create-next-app/templates/index.ts)). Not in 16.3.5; Next's own docs still document the PostCSS route ([CSS](https://nextjs.org/docs/app/getting-started/css#tailwind-css)).

## Lint

- `next lint` and the `eslint` key in `next.config` were **removed in 16.0**; `next build` no longer lints. Run the ESLint CLI from a script ([ESLint ref](https://nextjs.org/docs/app/api-reference/config/eslint), [install#linting](https://nextjs.org/docs/app/getting-started/installation#set-up-linting)).
- Default is flat config. Generated `eslint.config.mjs` (verbatim from template):

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
export default eslintConfig;
```

- `eslint-config-next` = `@next/eslint-plugin-next` + `eslint-plugin-react` + `eslint-plugin-react-hooks` recommended; `/core-web-vitals` upgrades CWV rules to errors; `/typescript` adds typescript-eslint recommended. No Prettier is scaffolded; docs suggest `eslint-config-prettier/flat` if you add one.
- `--biome` alternative: `biome.json` with `linter.domains: { next: "recommended", react: "recommended" }`, `css.parser.tailwindDirectives: true`, `vcs.useIgnoreFile: true`, `assist.actions.source.organizeImports: "on"`; scripts `"lint": "biome check"`, `"format": "biome format --write"` ([template biome.json](https://github.com/vercel/next.js/blob/v16.3.5/packages/create-next-app/templates/app-tw/ts/biome.json), [Biome domains](https://biomejs.dev/linter/domains/)).
- TypeScript 7: `npm i -D typescript@^7`; Next uses the project-local `tsc` CLI by default (`experimental.useTypeScriptCli`, default on), so it works, but you lose Next's route-aware code frames and it checks the whole `tsconfig` project including tests ([TS ref](https://nextjs.org/docs/app/api-reference/config/typescript#using-typescript-7)). Minimum TS is 5.1.

## Tailwind v4 in Next

Setup ([Tailwind guide, v4.3](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Next CSS](https://nextjs.org/docs/app/getting-started/css#tailwind-css)) — this is exactly what `create-next-app --tailwind` emits:

```bash
npm install -D tailwindcss @tailwindcss/postcss postcss
```
```js
// postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } };
```
```css
/* src/app/globals.css, imported from src/app/layout.tsx */
@import "tailwindcss";
```

- No `tailwind.config.js`. Content is auto-detected; `.gitignore`d files, `node_modules`, binaries and CSS are skipped. Add paths with `@source "../path";`, exclude with `@source not "...";`, set the scan root with `@import "tailwindcss" source("../src");` ([detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)).
- Tokens live in `@theme` and generate both a CSS variable and utilities ([theme](https://tailwindcss.com/docs/theme)):

```css
@theme {
  --color-mint-500: oklch(0.72 0.11 178); /* -> bg-mint-500, text-mint-500, var(--color-mint-500) */
  --font-sans: "Inter", sans-serif;
  --breakpoint-sm: 30rem;                 /* override a default */
  --color-*: initial;                     /* wipe a whole namespace before redefining */
}
```
  Namespaces: `--color-*`, `--font-*`, `--text-*`, `--font-weight-*`, `--tracking-*`, `--leading-*`, `--breakpoint-*`, `--container-*`, `--spacing-*`, `--radius-*`, `--shadow-*`, `--blur-*`, `--ease-*`, `--animate-*`. `--*: initial` disables the entire default theme. Use `@theme inline { ... }` when a token's value is `var(--other)` so the utility inlines the value instead of referencing it (needed for `next/font` variables and for runtime-swapped vars).
- Scaffold's `globals.css` pattern: plain `:root { --background; --foreground }`, overridden under `@media (prefers-color-scheme: dark)`, then `@theme inline { --color-background: var(--background); --font-sans: var(--font-geist-sans); }` ([template](https://github.com/vercel/next.js/blob/v16.3.5/packages/create-next-app/templates/app-tw/ts/app/globals.css)).
- Dark mode ([dark-mode](https://tailwindcss.com/docs/dark-mode)): `dark:` uses `prefers-color-scheme` by default (zero config, no toggle). For a manual toggle, redefine the variant:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));                       /* class on <html> */
/* or */ @custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```
  and set the class from an inline `<head>` script to avoid FOUC: `document.documentElement.classList.toggle("dark", localStorage.theme === "dark" || (!("theme" in localStorage) && matchMedia("(prefers-color-scheme: dark)").matches))`; remove `localStorage.theme` to fall back to system.

## Vitest + Testing Library (App Router)

Next's guide ([vitest](https://nextjs.org/docs/app/guides/testing/vitest)):

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths
```
```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
export default defineConfig({ plugins: [tsconfigPaths(), react()], test: { environment: 'jsdom' } })
```
```tsx
// __tests__/page.test.tsx (colocating inside app/ is also fine)
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import Page from '../app/page'
test('Page', () => { render(<Page />); expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeDefined() })
```
Script `"test": "vitest"` watches by default; use `vitest run` in CI.

- **Unsupported:** "Since `async` Server Components are new to the React ecosystem, Vitest currently does not support them. While you can still run unit tests for synchronous Server and Client Components, we recommend using E2E tests for `async` components." ([vitest guide](https://nextjs.org/docs/app/guides/testing/vitest), [testing overview](https://nextjs.org/docs/app/guides/testing#async-server-components)). Practical split: pure functions and sync/client components in Vitest; async pages via Playwright.
- Environment: Vitest documents `node` (default), `jsdom`, `happy-dom`, `edge-runtime`; "happy-dom ... considered to be faster than jsdom, but lacks some API". Per-file override: `// @vitest-environment jsdom` ([environment](https://vitest.dev/guide/environment)). Next's guide and example use jsdom; no Next doc mentions happy-dom.
- Vitest 5 (nine days old) specifics ([migration](https://vitest.dev/guide/migration)): requires Node >= 22.12 and Vite >= 6.4; `vite` is a non-optional peer (`^6.4 || ^7 || ^8`), so install it explicitly (`npm i -D vite`) rather than relying on auto-peer install; `@vitejs/plugin-react@6` requires `vite ^8`; `clearMocks` now defaults to `true`; `vi.mock`/`vi.hoisted` must be at module top level; unawaited `resolves`/`rejects` fail the test; reports go under a single `.vitest/` dir.
- The official [`with-vitest` example](https://github.com/vercel/next.js/tree/canary/examples/with-vitest) is stale (`vitest ^3.2.4`, `@vitejs/plugin-react ^5`, `jsdom ^26`) — take the config shape, not the pins.

## Playwright smoke against the deployed URL

Everything below is composed from [test-configuration](https://playwright.dev/docs/test-configuration), [browsers](https://playwright.dev/docs/browsers) and [ci-intro](https://playwright.dev/docs/ci-intro). `webServer` is optional; omit it and set `baseURL` from the environment.

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```
```ts
// e2e/smoke.spec.ts
import { test, expect } from '@playwright/test'
test('home renders', async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toBeVisible() })
```
```yaml
# CI job (after actions/checkout@v6, actions/setup-node@v6 node-version: lts/*, npm ci)
- run: npx playwright install --with-deps chromium     # one browser + Linux system deps; --only-shell for headless-shell only
- run: npx playwright test
  env: { BASE_URL: https://<fly-app>.fly.dev }
- uses: actions/upload-artifact@v4
  if: ${{ !cancelled() }}
  with: { name: playwright-report, path: playwright-report/, retention-days: 30 }
```
Next's own guide only covers localhost + `webServer` and recommends testing a production build ([playwright guide](https://nextjs.org/docs/app/guides/testing/playwright)); a deployed URL satisfies that by construction.

## Docker: standalone output

- `next.config.ts`: `output: "standalone"` → `.next/standalone` with a minimal `server.js` and only traced `node_modules`. `public/` and `.next/static/` are **not** copied; copy them in yourself. `PORT` and `HOSTNAME` env are honoured by `server.js` ([output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)). Not a monorepo, so `outputFileTracingRoot` is irrelevant.
- Official [`examples/with-docker/Dockerfile`](https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile) (three stages, `ARG NODE_VERSION=24.13.0-slim`): `dependencies` copies lockfiles and runs `npm ci`/`yarn`/`pnpm` by lockfile detection with cache mounts; `builder` copies `node_modules` + source, `ENV NODE_ENV=production`, runs the build; `runner`:

```dockerfile
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME="0.0.0.0"
COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir .next && chown node:node .next
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```
- Gotchas from the example README ([README](https://github.com/vercel/next.js/blob/canary/examples/with-docker/README.md)): any `.env*` present in the build context is copied into `.next/standalone` and ships in the image — keep secrets out of committed env files; `.next/cache` mount speeds rebuilds but drops build-time fetch cache from the image.

## fly.toml essentials

From the [configuration reference](https://fly.io/docs/reference/configuration/) and the [Next.js guide](https://fly.io/docs/js/frameworks/nextjs/). `fly launch` detects Next, generates `Dockerfile` + `fly.toml` (via `@flydotio/dockerfile`), defaults to `shared-cpu-1x` / 1 GB, and recommends `output: "standalone"` ("~400mb" smaller image).

```toml
app = "jacobcheatley-com"
primary_region = "syd"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"                       # names are case-sensitive and may not start with FLY_

[deploy]
  release_command = "<migrate cmd>"   # e.g. drizzle-kit migrate — see note below
  strategy = "rolling"                # default; canary | bluegreen | immediate

[http_service]
  internal_port = 3000                # default is 8080 — must match the container
  force_https = true
  auto_stop_machines = "stop"         # default "off"
  auto_start_machines = true          # default true
  min_machines_running = 0            # default 0

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    timeout = "5s"
    method = "GET"
    path = "/"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

- `release_command` "runs in a temporary Machine using the newly built image, once per deploy attempt", with network, env and secrets but **no volumes**; a non-zero exit aborts the deploy; default `release_command_timeout` is 5 min; `[deploy.release_command_vm]` sizes it. Because it runs the **standalone runner image**, `drizzle-kit` and the `drizzle/` migration folder are not in it unless the Dockerfile copies them in — decide that in the scaffold spec.
- Build-time `NEXT_PUBLIC_*` values must be Docker `ARG`s; runtime secrets via `fly secrets set` or `fly deploy --build-secret` for build-only needs.

## Surprises and unsupported

1. **Vitest 5.0.0 landed 2026-09-03**: `vite` is now a required peer and `@vitejs/plugin-react@6` needs Vite 8; the Next example and guide predate it. Node >= 22.12 rules out Node 20 for tests even though Next itself allows 20.9.
2. **TypeScript 7 is npm `latest`** but `create-next-app` still pins `^5`; Next supports 7 only through the `tsc` CLI path with reduced diagnostics.
3. **ESLint 10 is current**; the scaffold pins `^9`, `eslint-config-next` accepts `>=9`. `next lint` is gone.
4. **Async Server Components cannot be unit-tested in Vitest** per Next; E2E is the documented answer.
5. `create-next-app` canary is switching Turbopack projects from PostCSS to an `@tailwindcss/turbopack` loader; 16.3.5 still emits `postcss.config.mjs`.
6. `--src-dir` is not a default; `AGENTS.md`/`CLAUDE.md` generation is (`--no-agents-md` to skip).
