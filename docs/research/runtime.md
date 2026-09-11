# Runtime and package manager: Bun vs Node for Next.js on Fly

Resolves issue #2. Verified 2026-09-12 against primary sources; every claim links its source.

## Recommendation

**Bun 1.4 as runtime and package manager, one `oven/bun:1.4-slim` image, Next `output: "standalone"`, `CMD ["bun", "server.js"]`.**
Rationale: one binary does install, build, run and scripts, and Next's standalone `server.js` is runtime-agnostic, so
falling back to Node is a two-line Dockerfile edit (base image + CMD), not a migration.

Guardrails that keep this the lazy option:

- Pin `oven/bun:1.4-slim`. 1.4 is the Zig-to-Rust rewrite, GA 2026-08-20; Vercel still maps `1.x` to 1.3.14 and flags 1.4 as
  having breaking changes (<https://vercel.com/docs/functions/runtimes/bun>).
- Leave `cacheComponents` / `partialPrefetching` off. The only reproduced, still-open Bun+Next bug needs both (see below).
- Tests stay on Vitest + Playwright via `bun run test` / `bun run e2e`; never `bun test` for Vitest files (<https://vitest.dev/guide/>).
- If anything Bun-runtime-specific bites: `FROM node:24-slim` + `CMD ["node","server.js"]`, keep `bun install` in the deps stage.

Fallback ranking: (2) Node 24 runtime + Bun as PM; (3) Node 24 + pnpm 12 (what `fly launch` generates, minus pnpm).

## Versions verified

| Thing | Version | Date / note | Source |
|---|---|---|---|
| Bun | 1.4.2 | 2026-09-05; 1.4.0 GA 2026-08-20 | <https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2>, <https://bun.sh/blog/bun-v1.4> |
| Node Active LTS | 24.21.0 (Krypton) | Maintenance from 2026-10-20, EOL 2028-04-30; v26 becomes Active LTS 2026-10-28 | <https://nodejs.org/en/about/previous-releases>, <https://github.com/nodejs/release#release-schedule> |
| Next.js | 16.3.5 | 2026-09-11; `engines.node >=20.9.0` | <https://github.com/vercel/next.js/releases/tag/v16.3.5>, <https://github.com/vercel/next.js/blob/canary/packages/next/package.json> |
| pnpm | 12.4.1 | `engines.node >=18` | <https://registry.npmjs.org/pnpm/latest> |
| Vitest | 5.0.0 | `engines ^22.12 \|\| ^24 \|\| >=26` | <https://registry.npmjs.org/vitest/latest> |
| @playwright/test | 1.63.0 | docs: Node 22.x, 24.x or 26.x | <https://playwright.dev/docs/intro> |
| drizzle-kit | 0.31.10 | | <https://registry.npmjs.org/drizzle-kit/latest> |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | | <https://registry.npmjs.org/tailwindcss/latest> |
| sharp (next/image) | 0.35.4 | `engines.node >=20.9.0` | <https://registry.npmjs.org/sharp/latest> |

## Does Next.js's production server run on Bun?

Documented positions:

- Next.js docs list Bun only as a package manager (`bun create next-app`, `bunx next`); the runtime requirement is Node.js 20.9+,
  and self-hosting is described as "a Node.js server" (<https://nextjs.org/docs/app/getting-started/installation>,
  <https://nextjs.org/docs/app/api-reference/cli/next>, <https://nextjs.org/docs/app/guides/self-hosting>). Standalone output is
  started with `node .next/standalone/server.js`; `next start` warns when `output: standalone` is set
  (<https://nextjs.org/docs/app/api-reference/config/next-config-js/output>).
- Bun's guide runs `bun --bun next dev|build|start` and lists no limitations (<https://bun.sh/guides/ecosystem/nextjs>). Bun 1.4
  release notes: "`bun --bun next build` works on Next.js 16.3 with Turbopack and the React Compiler" (<https://bun.sh/blog/bun-v1.4>).
- Vercel runs Next.js on the Bun runtime in public beta (`bunVersion: "1.4.x"`), requiring `bun run --bun next build` when ISR is
  used (<https://vercel.com/docs/functions/runtimes/bun>). Strongest evidence that Next-on-Bun is a supported path.
- `bun run` respects a `#!/usr/bin/env node` shebang and runs Node if it is on PATH; `--bun` overrides. When `node` is absent
  (inside `oven/bun`), Bun aliases `node` to itself (<https://bun.sh/docs/runtime#--bun>, <https://bun.sh/docs/runtime/bunfig#run-bun>).

Issue tracker state (checked 2026-09-12):

| Issue | Status | Cause | Relevance |
|---|---|---|---|
| vercel/next.js#92778 memory leak under `bun --bun next start` | Closed 2026-08-24 as fixed in Bun 1.4.0 (oven-sh/bun#36624) | `Response.body`/`ReadableStream` GC cycle | Reason to pin >= 1.4.0 (<https://github.com/vercel/next.js/issues/92778>) |
| oven-sh/bun#39847 unhandled rejections per request | **Open**; reproduced by a Bun collaborator; fix PR #31721 open, needs a WebKit change | AsyncLocalStorage context lost in `unhandledRejection` listeners | Only with `cacheComponents` + `partialPrefetching`; non-fatal log noise (<https://github.com/oven-sh/bun/issues/39847>, <https://github.com/oven-sh/bun/pull/31721>) |
| oven-sh/bun#39861 AbortError exits process (exit 128) | **Open**; Bun maintainer could not reproduce on 1.4.0 incl. a Next 16.3.1 app; Vercel asked for a repro | Aborted request mid-RSC render | Vercel-only evidence so far (<https://github.com/oven-sh/bun/issues/39861>) |
| oven-sh/bun#39691 request for official Next+Bun Dockerfile | **Open**; docs PR #39694 (unmerged) supplies one | No official Docker guide yet | Dockerfile below is that PR's, with the slim tag (<https://github.com/oven-sh/bun/issues/39691>, <https://github.com/oven-sh/bun/pull/39694>) |
| oven-sh/bun#25639 Cache Components `setTimeout()` warning | Closed, fixed by PR #26021 | Timer ordering | Historical (<https://github.com/oven-sh/bun/issues/25639>) |
| oven-sh/bun#18716 SIGILL on `next start` | Closed, fixed by PR #18788 (Apr 2025) | JSC GC crash | Historical (<https://github.com/oven-sh/bun/issues/18716>) |
| oven-sh/bun#17723 Node-to-Bun CPU/memory spike in containers | **Open** since Feb 2025, not Next-specific, reported on 1.2.x | Unknown | Watch item only (<https://github.com/oven-sh/bun/issues/17723>) |

Net: for a plain App Router site (no `cacheComponents`), no open, reproduced issue affects `bun server.js` on Bun 1.4.x.

## Docker on Fly

What Fly generates for Next.js (`fly launch` runs `@flydotio/dockerfile`): base `node:${NODE_VERSION}-slim`, build with
`npx next build --experimental-build-mode compile`, final stage copies `.next/standalone`, `.next/static`, `public`, `EXPOSE 3000`,
`CMD ["node","server.js"]` (<https://github.com/fly-apps/dockerfile-node/blob/main/test/frameworks/next-standalone/Dockerfile>).
The generator supports Bun (`bunx dockerfile`, `FROM oven/bun:${BUN_VERSION}-<variant>`) but its fixtures are
`next-npm|pnpm|yarn|standalone` and `svelte-bun`; there is no Next+Bun fixture
(<https://github.com/fly-apps/dockerfile-node/blob/main/templates/Dockerfile.ejs>, <https://github.com/fly-apps/dockerfile-node/tree/main/test/frameworks>).
Fly recommends standalone output ("can reduce your total image size by ~400mb") and defaults Machines to shared-cpu-1x / 1 GB
(<https://fly.io/docs/js/frameworks/nextjs/>). Fly's stated position: "Bun, Deno, and Node.js applications ... via Dockerfiles"
(<https://fly.io/docs/js/the-basics/dockerfiles/>).

Base image sizes, compressed linux/amd64, Docker Hub 2026-09 (<https://hub.docker.com/r/oven/bun/tags>, <https://hub.docker.com/_/node/tags>):

| Image | MB | Notes |
|---|---|---|
| `oven/bun:1.4-slim` | 68 | Debian slim; `node` on PATH is a symlink to `bun` |
| `oven/bun:1.4-alpine` | 40 | musl; native deps (sharp, oxide) need musl builds |
| `oven/bun:1.4-distroless` | 41 | no shell |
| `oven/bun:1.4` (debian) | 88 | Bun's generic guide uses `oven/bun:1` |
| `node:24-slim` | 81 | what Fly generates |
| `node:24-alpine` | 59 | |
| `node:24-bookworm` | 410 | full |

Payload is identical either way: Bun's docs PR measures `.next/standalone` at ~57 MB for a fresh `create-next-app` vs ~465 MB for
`node_modules` (<https://github.com/oven-sh/bun/pull/39694>). Final images land near 130 MB (Bun slim) vs 140 MB (Node slim);
the runtime choice is a rounding error once standalone is on.

Build time: no primary-source benchmark of `next build` under Bun vs Node exists; `next build` is Turbopack (Rust) either way.
The differentiator is the install step, where Bun claims 30x vs npm cold and 7x on warm CI (<https://bun.sh/blog/bun-v1.4>).

Dockerfile (Bun's proposed guide with the slim tag; same shape as Fly's template):

```dockerfile
FROM oven/bun:1.4-slim AS base
WORKDIR /app
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun --bun next build
FROM base AS release
COPY --from=build --chown=bun:bun /app/.next/standalone ./
COPY --from=build --chown=bun:bun /app/.next/static ./.next/static
COPY --from=build --chown=bun:bun /app/public ./public
ENV HOSTNAME=0.0.0.0
USER bun
EXPOSE 3000
CMD ["bun", "server.js"]
```

Node fallback: build/release stages `FROM node:24-slim`, keep the `oven/bun` deps stage for `bun install`, CMD `["node","server.js"]`.
For a pnpm variant note `corepack` ships with Node 24 but was removed in Node 25+, so the Dockerfile needs `npm i -g pnpm` or
`corepack enable` and gets revisited on Node 26 (<https://github.com/nodejs/corepack>).

## Tool compatibility

| Tool | Bun as PM | Bun as runtime | Source |
|---|---|---|---|
| Vitest 5 | Yes; run `bun run test`, not `bun test` | Bun 1.4 notes: runs under Bun with `--coverage` and thread/fork pools. `engines` excludes Bun; `bun run` hands off to Node if installed | <https://vitest.dev/guide/>, <https://bun.sh/blog/bun-v1.4>, <https://registry.npmjs.org/vitest/latest> |
| Playwright 1.63 | Yes (no bun tab in docs; plain npm package) | Docs require Node 22/24/26; Bun 1.4 notes: `playwright test` and `--ui` run on Bun. No open Bun issues in microsoft/playwright. Browsers are out-of-process, so runtime barely matters | <https://playwright.dev/docs/intro>, <https://bun.sh/blog/bun-v1.4> |
| drizzle-kit 0.31 | Yes, `bunx drizzle-kit ...` is in the official docs | Drizzle recommends Bun for running TS scripts; Neon guide uses `neon-http`, runtime-neutral | <https://orm.drizzle.team/docs/kit-overview>, <https://orm.drizzle.team/docs/get-started/neon-new> |
| Tailwind v4.3 | Yes (`@tailwindcss/postcss`; oxide native binary is an optional dep) | Runs inside `next build`, so whatever runs Next. No open Bun-runtime issues in tailwindlabs/tailwindcss; closed oven-sh/bun#21228 was `bun build --compile`, irrelevant | <https://tailwindcss.com/docs/installation/framework-guides/nextjs> |
| sharp 0.35 (next/image) | `bun add sharp` documented; pnpm must allow optional deps | N-API addon; Next self-hosting: image optimisation is zero-config with `next start`/standalone | <https://sharp.pixelplumbing.com/install/>, <https://nextjs.org/docs/app/guides/self-hosting> |

## Option comparison

| | Bun runtime + PM | Node 24 + Bun PM | Node 24 + pnpm 12 |
|---|---|---|---|
| Toolchains | 1 | 2 (Bun installs, Node runs) | 2 (Node + pnpm via corepack/npm) |
| Dockerfile | hand-written (above), 1 base image | 2 base images, 3 stages | generated by `fly launch` |
| Vendor support | Vercel public beta; Next docs silent; Fly generic | Fully documented everywhere | Fully documented everywhere |
| Open runtime bugs | #39847 (opt-in features only), #39861 (unreproduced) | none Bun-related | none |
| Local dev | `bun --bun next dev` | `bun next dev` runs Node via shebang | `pnpm dev` |
| Install speed | fastest | fastest | fine |

## Surprises

- Next.js has never documented Bun as a runtime; support is de facto (Bun's guide, Vercel's beta), not de jure.
- The Next-on-Bun memory leak (#92778) was a real Bun bug, fixed only in 1.4.0+, which shipped three weeks ago.
- Fly's generator, despite Bun support, has zero Next+Bun test coverage; Bun's own Next+Docker guide is still an unmerged PR.
- Vercel's `bunVersion: "1.x"` still resolves to 1.3.14; they treat 1.4 as a migration, not a patch.
