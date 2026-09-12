# TanStack Start stack facts

Researched 2026-09-12 for issue #13. Primary sources only; "verified locally" = run on this machine (Node 24.14.1, Bun 1.4.2 via `npx bun`, Docker 29.2.1) against a fresh `@tanstack/cli@0.71.0` scaffold.

## Recommendation

- **Runtime: Bun 1.4 in production, Node 24 as the zero-cost fallback.** Build with plain `vite build` (no Nitro). Output is `dist/client/` + `dist/server/server.js`, whose default export is a WinterCG `fetch(Request)` handler ([server entry docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point)). Wrap it in a ~15-line `Bun.serve` `server.ts` (the pattern of the official [`start-bun` example](https://github.com/TanStack/router/tree/main/examples/react/start-bun)); the same `dist/` runs on Node with `srvx --prod -s ../client dist/server/server.js`. Both verified locally. Skip Nitro: it is `3.0.x-beta` on npm and its bundle 500s in production if the scaffold's `<TanStackDevtools>` is left in `__root.tsx` (verified locally; the plain build is unaffected).
- **Scaffold:** `npx @tanstack/cli@latest create jacobcheatley-com --framework React --toolchain biome --package-manager bun --no-examples --no-intent` (Tailwind v4 is always on; add `--add-ons drizzle` for a `drizzle-orm/node-postgres` + `pg` starter, or hand-write the same 3 files).
- **Dockerfile (Fly, Bun):** see the Bun Dockerfile below; 121 MB image, verified serving `/` and hashed assets. Node variant also below.

## Versions (npm `latest`, 2026-09-10 to 2026-09-12)

| Package | Version | Note |
|---|---|---|
| `@tanstack/react-start` | 1.168.52 | peer `vite >=7.0.0`, `react >=18`; `engines.node >=22.12.0` ([npm](https://www.npmjs.com/package/@tanstack/react-start)) |
| `@tanstack/react-router` | 1.170.35 | lockstep release `release-2026-09-10-1817` ([releases](https://github.com/TanStack/router/releases)) |
| `@tanstack/react-router-ssr-query` / `@tanstack/react-query` | 1.167.2 / 5.102.8 | only if Query is added later |
| `vite` | 8.3.0 (2026-09-10) | Rolldown-based; requires Node 20.19+ / 22.12+ ([vite.dev/guide](https://vite.dev/guide/)) |
| `react` / `react-dom` | 19.3.0 (2026-09-09) | Bun hosting docs require React 19 |
| `vitest` | 5.0.0 (2026-09-03) | requires Vite >=6.4, Node >=22.12 ([vitest.dev/guide](https://vitest.dev/guide/)) |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.3 | |
| `@biomejs/biome` | 2.5.13 | scaffold pins 2.4.5 |
| `@playwright/test` | 1.63.0 | |
| `drizzle-orm` / `drizzle-kit` | 0.45.2 / 0.31.10 | 1.0.0-rc.5 exists under `rc` tag |
| `@tanstack/cli` | 0.71.0 | aliases `@tanstack/create-start` 0.59.43, `create-tsrouter-app` 0.54.43 |
| Bun | 1.4.2 (2026-09-05) | Docker tags `oven/bun:1.4`, `1.4-slim`, `1.4.2-slim` ([releases](https://github.com/oven-sh/bun/releases)) |
| Node | 24.21.0 LTS "Krypton" (2026-09-07) | ([nodejs.org/dist](https://nodejs.org/dist/index.json)) |
| `nitro` | 3.0.260903-beta | still beta |

## Release status; Vite-native vs Nitro

- Start is **not GA**. The overview says: "TanStack Start is currently in the **Release Candidate** stage! This means it is considered feature-complete and its API is considered stable." ([overview](https://tanstack.com/start/latest/docs/framework/react/overview)). The RC announcement is dated 2025-09-23 ([blog](https://tanstack.com/blog/announcing-tanstack-start-v1)); no 1.0 post exists on the [blog index](https://tanstack.com/blog) through 2026-09-08. The `1.16x` version is lockstep with Router, not a GA marker.
- **Vite-native.** The Start Vite plugin (`@tanstack/react-start/plugin/vite`) builds client + server with the Vite Environments API; the overview says "With Vite and Rsbuild support, it's ready to develop and deploy". Nitro is an **optional** Vite plugin (`import { nitro } from 'nitro/vite'`) used only for hosting presets; the hosting page calls it "still under active development" ([hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)).

## Runtime and build output

- Plain `vite build` (verified locally): `dist/client/assets/*` + `dist/server/server.js` (~63 kB) with `default.fetch(Request)`. The server bundle is **not self-contained**: it imports `@tanstack/*`, `h3-v2`, `seroval`, `react/jsx-runtime`, `node:async_hooks` from `node_modules`, so production images need `node_modules` (a first Bun image without them failed with `Cannot find package 'h3-v2'`).
- With `nitro()`: `.output/server/index.mjs` + `.output/public/`; self-contained (1.5 MB, deps inlined under `_libs/`); start with `node .output/server/index.mjs`, `PORT` respected (verified locally).
- **Bun as production server, per docs:** Bun is a listed hosting target, but the section is thin: "Currently, the Bun specific deployment guidelines only work with React 19", a vite config with `nitro({ preset: 'bun' })`, then `bun run build && bun run server.ts` copied from the example ([hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)). The example itself uses **no Nitro** and loads `./dist/server/server.js` + `./dist/client` inside `Bun.serve` ([server.ts](https://github.com/TanStack/router/blob/main/examples/react/start-bun/server.ts)). The docs are silent on Bun as a Vite dev runtime; the CLI prints `bun --bun run dev` as its dev hint (not verified here).
- Node without Nitro is docs-backed only for Rsbuild output ("`srvx --prod -s ../client dist/server/index.js`"), with "Express or any other custom Node.js server works too, as long as it serves the client assets and calls the server entry's `fetch` handler". The same srvx command against the Vite output worked locally (`-s` resolves relative to the entry file; [srvx CLI](https://github.com/h3js/srvx/blob/main/docs/1.guide/10.cli.md)).

Verified matrix (GET `/` 200 HTML + hashed asset 200): Bun.serve + `dist/` (local and Docker), Node + srvx + `dist/` (local), Node + Nitro `.output` (local and Docker, after removing devtools from `__root.tsx`).

## Dockerfiles for Fly

Bun (verified: builds, serves; 121 MB). `server.ts` at repo root:

```ts
const start = (await import("./dist/server/server.js")).default as { fetch: (r: Request) => Promise<Response> | Response };
Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/assets/")) {
      const f = Bun.file(`./dist/client${pathname}`);
      if (await f.exists()) return new Response(f, { headers: { "cache-control": "public, max-age=31536000, immutable" } });
    }
    return start.fetch(req);
  },
});
```

```dockerfile
FROM oven/bun:1.4-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
RUN rm -rf node_modules && bun install --frozen-lockfile --production

FROM oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts /app/package.json ./
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
```

Node 24 with Nitro (verified; 81 MB). Requires `npm i nitro` and `nitro()` in `vite.config.ts`. Do **not** keep a root `server.ts`: Nitro treats it as its server entry (verified: build fails with `UNRESOLVED_IMPORT ./dist/server/server.js`).

```dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

Node without Nitro: same as the Bun file with `node:24-slim`, `npm ci`, ship `node_modules` + `dist`, `CMD ["npx","srvx","--prod","-s","../client","dist/server/server.js"]` (srvx 1.0.4; not container-tested).

`.dockerignore`: `node_modules`, `dist`, `.output`. Fly: "The recommended way to deploy Bun, Deno, and Node.js applications is via Dockerfiles" ([fly docs](https://fly.io/docs/js/the-basics/dockerfiles/)); `fly.toml` needs `primary_region = "syd"` ([regions](https://fly.io/docs/reference/regions/)) and `[http_service] internal_port = 3000`, `force_https = true`, `auto_stop_machines = "stop"`, `auto_start_machines = true`, `min_machines_running = 0` ([configuration](https://fly.io/docs/reference/configuration/)).

## Known issues: Start on Bun

- Open: [TanStack/router#7079](https://github.com/TanStack/router/issues/7079) "Cannot find module 'bun'" when importing Bun builtins (`bun:*`) from server code in a monorepo (2026-05). Avoid Bun-only APIs inside Start modules; keep them in `server.ts`.
- Open, adjacent: [oven-sh/bun#40378](https://github.com/oven-sh/bun/issues/40378) Router under Bun's own HTML bundler (not Vite); [oven-sh/bun#31457](https://github.com/oven-sh/bun/issues/31457) "Vite+ x Bun Crypto Bug".
- Closed in the last year: [#5205](https://github.com/TanStack/router/issues/5205) incomplete Bun hosting docs (2025-09), [#3989](https://github.com/TanStack/router/issues/3989) random SSR dehydration errors on Bun (2025-12), [#6169](https://github.com/TanStack/router/issues/6169) `node:*` leaking into client build (2025-12), [#6144](https://github.com/TanStack/router/issues/6144) build with `server.ts` (2025-12), [#6034](https://github.com/TanStack/router/issues/6034) HMR on Bun (2026-01), [#7189](https://github.com/TanStack/router/issues/7189) duplicate `Set-Cookie` dropped on Linux Bun (2026-04), [#7151](https://github.com/TanStack/router/issues/7151) `node:async_hooks` in browser (2026-06), [#5289](https://github.com/TanStack/router/issues/5289) SSR streaming memory leak reproduced on Bun (2025-10).
- Not Bun-specific but relevant to any Fly deploy: [#7991](https://github.com/TanStack/router/issues/7991) client disconnect mid-SSR logged as unhandled 500 (open, 2026-09).

## SSR

- Streaming is the default: "This streaming pattern is all automatic as long as you are using either `defaultStreamHandler` or `renderRouterToStream`" ([router SSR guide](https://tanstack.com/router/latest/docs/framework/react/guide/ssr)); the default `src/server.ts` is `createStartHandler(defaultStreamHandler)` wrapped by `createServerEntry` ([server entry](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point)).
- Per-route opt-out: `ssr: false` (nothing runs on the server), `ssr: 'data-only'` (`beforeLoad`/`loader` run on the server, component renders client-only); global default via `createStart(() => ({ defaultSsr: false }))` in `src/start.ts` ([selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr)).
- Flat top-level routes: `src/routes/arg.tsx` -> `/arg`, `src/routes/some-project.tsx` -> `/some-project`; `__root.tsx` is the document shell; `routeTree.gen.ts` "is automatically generated when you run TanStack Start" and is excluded from Biome by the scaffold ([Start routing](https://tanstack.com/start/latest/docs/framework/react/guide/routing), [routing concepts](https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts)).
- Pathless layouts: `_shell.tsx` + `_shell.arg.tsx` (or `_shell/route.tsx` + `_shell/arg.tsx`) render `<Outlet />` inside the layout with no URL segment, so the page is still `/arg` ([routing concepts](https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts)).

## Server functions, middleware, server routes, Drizzle

- `createServerFn({ method }).validator(fn).handler(async ({ data, context }) => ...)`; callable from loaders and components; only the handler runs on the server ([server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)). `inputValidator` is `@deprecated Use validator instead` in 1.168 typings; the CLI's drizzle add-on still emits it.
- Drizzle: put the client in a `*.server.ts` file (`export const db = drizzle(process.env.DATABASE_URL!, { schema })` from `drizzle-orm/node-postgres`, as the CLI add-on generates) and import it only inside handlers. Import protection (on by default) denies `**/*.server.*` in the client build and strips handler-only imports; a helper referenced outside the handler "keeps the import alive in the client build" ([import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection)). `createServerOnlyFn` throws if called on the client ([execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)). The databases guide is provider-neutral and lists Neon as a partner ([databases](https://tanstack.com/start/latest/docs/framework/react/guide/databases)).
- Middleware: `createMiddleware().server(...)`; attach per server fn or per route via `server: { middleware: [...] }` ([middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)).
- Server routes (API endpoints) live on file routes: `createFileRoute('/api/hello')({ server: { handlers: { GET: async ({ request }) => new Response(...) } } })`, per-method middleware via `createHandlers` ([server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes)).

## TanStack Query later

Add `@tanstack/react-query` + `@tanstack/react-router-ssr-query`; in `getRouter()` create a per-request `QueryClient`, pass `context: { queryClient }`, then `setupRouterSsrQueryIntegration({ router, queryClient })` (wraps `QueryClientProvider`, handles redirects, dehydrates into the SSR stream). "Ensure a fresh QueryClient is created per request in SSR environments." ([Start Query guide](https://tanstack.com/start/latest/docs/framework/react/guide/tanstack-query), [integration reference](https://tanstack.com/router/latest/docs/integrations/query)). Skeleton hook: keep `getRouter()` in `src/router.tsx` and use `createRootRouteWithContext<{}>()` so a `queryClient` field can be added later.

## Testing

- Start docs have no testing page (code search of `docs/start` for "vitest": 0 relevant hits). Router how-tos cover Vitest: `npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`, `vitest.config.ts` with `plugins: [react()]`, `test.environment: 'jsdom'` ([setup-testing](https://tanstack.com/router/latest/docs/framework/react/how-to/setup-testing)); with file-based routing, `createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })` + `<RouterProvider>` and `vi.mock` for loader deps ([test-file-based-routing](https://tanstack.com/router/latest/docs/framework/react/how-to/test-file-based-routing)).
- Verified locally with Vitest 5: a **separate** `vitest.config.ts` (`viteReact()` only, `resolve.tsconfigPaths`, `environment: 'node'`, `// @vitest-environment jsdom` per component test) renders `/` from `routeTree.gen.ts`. Calling a `createServerFn` directly **fails** in Vitest (`getStartContext` async-local-storage error), with or without the Start plugin. So: keep logic in plain `*.server.ts` functions and unit-test those; treat server fns as thin wrappers.
- Playwright (one smoke against the deployed URL) is what covers SSR HTML, hydration, streaming, the server-fn RPC over HTTP, cookies/middleware and `ssr: false` behaviour.

## Tailwind v4 and the scaffolder

- `@tailwindcss/vite` plugin + `@import 'tailwindcss'` in `src/styles.css`, linked from `__root.tsx` via `import appCss from '../styles.css?url'` ([Start Tailwind guide](https://tanstack.com/start/latest/docs/framework/react/guide/tailwind-integration), [tailwind docs](https://tailwindcss.com/docs/installation/using-vite)).
- `@tanstack/cli create` flags: `--framework`, `--toolchain <biome|eslint>`, `--package-manager <npm|yarn|pnpm|bun|deno>`, `--add-ons`, `--list-add-ons`, `--deployment <cloudflare|netlify|nitro|railway|render|vercel>`, `--no-examples`, `--blank`, `--router-only`, `--no-install`, `--no-git`, `--no-intent`, `-y`; `--tailwind` is a deprecated no-op ("standard scaffolds always enable Tailwind") ([TanStack/cli](https://github.com/TanStack/cli)). `npm create @tanstack/start@latest` is an alias.
- Generated (verified, `--no-examples`): `package.json` (scripts `dev: vite dev --port 3000`, `build: vite build`, `preview`, `generate-routes: tsr generate`, `format/lint/check: biome`), `vite.config.ts` (`devtools(), tailwindcss(), tanstackStart(), viteReact()`), `src/router.tsx`, `src/routes/__root.tsx` (renders `<TanStackDevtools>`), `src/routes/index.tsx`, `src/styles.css`, `biome.json`, `tsconfig.json`, `tsr.config.json`, `.cta.json`. No `start` script, no tests, no vitest config. Deps pinned `latest` for TanStack, `vite ^8`, `typescript ^6.0.2`. `--add-ons drizzle` adds `drizzle.config.ts`, `src/db/{index,schema}.ts`, `.env.local`, `db:*` scripts, `pg`, `drizzle-kit`, `dotenv`, `tsx`. `--deployment nitro` adds `nitro()` to the plugin list and pins `nitro` beta. Add-on list includes `drizzle`, `neon`, `tanstack-query`, `biome`, `sentry`, `better-auth`, `shadcn`, `t3env`, `storybook` (`--list-add-ons`).

## Realtime: WebSocket beside the Start handler (fact, not a decision)

- Bun: `Bun.serve({ fetch(req, server) { if (url.pathname === '/ws') return server.upgrade(req) ? undefined : new Response(null, { status: 400 }); return start.fetch(req) }, websocket: { message(ws, m) { ... } } })` ([Bun websockets](https://bun.com/docs/runtime/http/websockets)). Verified locally: HTML, asset and a WS echo through one `Bun.serve` on the built app.
- Node: no Start API for this. Options: Nitro's `features: { websocket: true }` + `defineWebSocketHandler` ("Node.js, Bun, Deno, Vercel and Cloudflare Workers"; [nitro websocket](https://nitro.build/docs/websocket)), or a hand-rolled `node:http` server that calls `start.fetch` for HTTP and hands `upgrade` events to `ws`. srvx's docs mention websockets only in `close()` semantics.

## Surprises

- Docs list Bun as a target but the Bun section (Nitro `preset: 'bun'`) contradicts the linked example (no Nitro); the example pattern is the one that works.
- Start is still labelled RC a year after the RC post, despite `1.168.x` versions.
- The plain Vite server bundle needs `node_modules` at runtime; Nitro's does not, but Nitro is beta, hijacks a root `server.ts`, and the scaffold's devtools in `__root.tsx` break its production bundle with a Solid "Client-only API called on the server side" 500.
- Server functions are not unit-testable as plain calls in Vitest.
