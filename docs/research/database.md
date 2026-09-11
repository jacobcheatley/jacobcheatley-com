# Drizzle, Neon driver, pooling and Compose parity

Research for [#4](https://github.com/jacobcheatley/jacobcheatley-com/issues/4). Checked 2026-09-12 against primary sources; versions quoted are npm `latest` on that date.

## Recommendation

- **Driver:** `pg` (node-postgres 8.23.0) via `drizzle-orm/node-postgres`. `drizzle(process.env.DATABASE_URL)` builds a `pg.Pool` under the hood; nothing else to configure. Neon's own guidance for a long-running server is a TCP driver with a client-side pool, and it lists `pg` first ([Neon: choose a connection](https://neon.com/docs/connect/choose-connection), [Drizzle: PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)).
- **One connection string, the Neon *direct* (unpooled) host, for both the app and `drizzle-kit`.** A single Fly machine with `pg.Pool` `max: 10` sits far below the 104 `max_connections` of Neon's smallest 0.25 CU compute; Compose Postgres has no PgBouncer, so direct-to-Postgres is what makes the two environments behave identically; and migrations need the direct host anyway. Move the *app* to the `-pooler` host only if you later run many instances or serverless functions.
- **Postgres 18.** Neon's default for new projects since 2026-06-05 (currently 18.6). Compose: `image: postgres:18` (also 18.6 today). Mount the volume at `/var/lib/postgresql`, not the pre-18 `/var/lib/postgresql/data`.
- **Migrations:** `drizzle-kit generate` locally, commit `drizzle/`, apply with `drizzle-kit migrate` as the Fly `release_command`. Use `drizzle-kit push` only against a local throwaway DB.
- **Tests:** point Vitest at the Compose Postgres (a second database on the same container), apply migrations in `globalSetup`, `TRUNCATE` between tests. Zero new dependencies and exactly the engine production runs. PGlite (in-memory, now also Postgres 18) is the fallback if Docker-free tests ever matter.

## Driver comparison

| Driver (version) | Drizzle adapter | Transport / runtime | Neon's guidance | Notes |
|---|---|---|---|---|
| `pg` 8.23.0 | `drizzle-orm/node-postgres` | TCP; Node | "use a standard TCP driver with connection pooling" for long-running servers; `pg` listed first ([Neon](https://neon.com/docs/connect/choose-connection)) | `Pool` defaults `max: 10`, `idleTimeoutMillis: 10000` ([node-postgres](https://node-postgres.com/apis/pool)). `sslmode=require` in the URL maps to `ssl: true`, i.e. full certificate verification against system CAs ([pg-connection-string](https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/README.md)). `@neondatabase/serverless` is a `pg` drop-in, so a later swap is mechanical. |
| `postgres` (postgres.js) 3.4.9 | `drizzle-orm/postgres-js` | TCP; Node, Bun, Deno | Listed alongside `pg`, "Use the client you prefer" ([Neon Node guide](https://neon.com/docs/guides/node)) | `max: 10`, `idle_timeout: 0`, `prepare: true` by default ([README](https://github.com/porsager/postgres)). Protocol-level prepared statements *are* fine through Neon's pooler ([Neon pooling](https://neon.com/docs/connect/connection-pooling)); Drizzle still flags the default as "a potential issue in AWS environments" ([Drizzle](https://orm.drizzle.team/docs/get-started-postgresql)). Equally good; `pg` wins on boringness. |
| `@neondatabase/serverless` 1.1.0 | `drizzle-orm/neon-http`, `drizzle-orm/neon-serverless` | HTTP or WebSocket; any JS runtime | "Ideal for serverless/edge deployment, using https and WebSockets in place of TCP" ([README](https://github.com/neondatabase/serverless)); for serverful use Drizzle points to `pg`/postgres.js ([Drizzle: Neon](https://orm.drizzle.team/docs/connect-neon)) | Speaks HTTP/WS to Neon's proxy, so it cannot talk to Compose Postgres at all: breaks parity. Out. |
| `Bun.sql` (built in) | `drizzle-orm/bun-sql` | TCP; **Bun only** | Named by Neon as a valid TCP driver ([Neon](https://neon.com/docs/connect/choose-connection)) | Pool `max` default 10 ([Bun docs](https://bun.com/docs/api/sql)). Open Drizzle issues: silent exit code 0 in scripts ([#5451](https://github.com/drizzle-team/drizzle-orm/issues/5451)), `drizzle-kit push` does not use it ([#4122](https://github.com/drizzle-team/drizzle-orm/issues/4122)), json/jsonb double-serialisation fix in flight ([#5364](https://github.com/drizzle-team/drizzle-orm/pull/5364)). App runs on Node, so out regardless. |

All four adapters, plus `drizzle-orm/pglite`, ship in stable `drizzle-orm` 0.45.2 with matching `*/migrator` exports; peer deps `pg >=8`, `postgres >=3`, `@neondatabase/serverless >=0.10.0`, `@electric-sql/pglite >=0.2.0` (npm registry metadata). The Drizzle connect pages currently show `npm i drizzle-orm@rc` (the v1 release candidate); install stable.

## Pooled vs direct connection strings

- Pooled = same host with a `-pooler` suffix; routes through PgBouncer in `pool_mode=transaction` ([Neon pooling](https://neon.com/docs/connect/connection-pooling)).
- Unsupported through the pooler: `SET`/`RESET`, `LISTEN`/`NOTIFY`, `WITH HOLD` cursors, SQL-level `PREPARE`, `PRESERVE ROWS` temp tables, session advisory locks. Neon: use the direct connection for "Schema migrations", `pg_dump`/`pg_restore`, logical replication, `CREATE INDEX CONCURRENTLY` ([pooling](https://neon.com/docs/connect/connection-pooling), [choose a connection](https://neon.com/docs/connect/choose-connection)). Neon's Drizzle guide repeats it: "we recommend using a direct (non-pooled) connection when performing migrations" ([guide](https://neon.com/docs/guides/drizzle-migrations)).
- Neon's default advice is "Use pooled connections by default" because the pooler takes 10,000 client connections. Direct `max_connections`: 104 at 0.25 CU, 209 at 0.5, 419 at 1 CU ([Neon computes](https://neon.com/docs/manage/computes)). One Fly machine with a 10-connection pool does not need the pooler, and Neon explicitly allows "Client-side or Neon pooling" for long-running servers ([choose a connection](https://neon.com/docs/connect/choose-connection)).
- Decision: `DATABASE_URL` = direct host everywhere. Neon requires TLS; `sslmode=require` is the minimum and `verify-full` the recommendation ([connect securely](https://neon.com/docs/connect/connect-securely)). With `pg`, either value yields verified TLS (table above).
- Scale to zero: compute suspends after 5 minutes with no active queries; "Scale to zero works even if clients are connected to the database". Suspend drops sessions (prepared statements, temp tables, `LISTEN`). The pool just reconnects, which wakes the compute. Neon's advice: log connection-loss errors, do not exit ([compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle), [scale to zero](https://neon.com/docs/introduction/scale-to-zero), [Neon blog](https://neon.com/blog/using-neons-auto-suspend-with-long-running-applications)). `pg.Pool`'s 10 s idle timeout already closes idle clients, so idle pool connections will not keep the compute awake.
- Fly `syd` and Neon `aws-ap-southeast-2` are both Sydney ([Neon regions](https://neon.com/docs/introduction/regions)).

## Postgres version

- Neon supports 14 to 18; "Postgres 18 is now the default for newly created Neon projects" (changelog [2026-06-05](https://neon.com/docs/changelog/2026-06-05)). Minor versions as of Aug 2026: 18.6, 17.11, 16.15 ([version policy](https://neon.com/docs/postgresql/postgres-version-policy)).
- Docker Hub `postgres` tags today: `18.6`, `18`, `latest` (and `17.11`, `16.15`, plus `-alpine`/`-trixie`/`-bookworm` variants). `postgres:18` tracks the same minor as Neon.
- 18+ image change: `PGDATA` is `/var/lib/postgresql/18/docker` and the declared `VOLUME` is `/var/lib/postgresql`. The old advice to mount at `/var/lib/postgresql/data` applies to 17 and earlier only ([Docker Hub](https://hub.docker.com/_/postgres)).

```yaml
# compose.yaml
services:
  db:
    image: postgres:18
    environment: { POSTGRES_PASSWORD: postgres }
    ports: ["5432:5432"]
    volumes: [db:/var/lib/postgresql]
volumes: { db: {} }
```

## drizzle-kit workflow and Fly release_command

- `generate` writes SQL migration files from the schema; `migrate` applies them and records each in `drizzle.__drizzle_migrations`; `push` diffs schema straight into the DB with no files ([kit overview](https://orm.drizzle.team/docs/kit-overview), [kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)).
- Drizzle's own steer: `push` "is the best approach for rapid prototyping"; "For production deployments, prefer the `generate` + `migrate` workflow to keep a versioned history of schema changes" ([kit push](https://orm.drizzle.team/docs/drizzle-kit-push), [migrations](https://orm.drizzle.team/docs/migrations)). `push --force` auto-accepts data-loss statements, which is the wrong default for a prod DB.
- `drizzle-kit migrate` reads `dbCredentials.url` from `drizzle.config.ts`, so one `DATABASE_URL` env var drives app, kit and tests ([config](https://orm.drizzle.team/docs/drizzle-config-file)).
- Fly: `release_command` "lets you run a one-off task, like a database migration, before any of your deployed Machines are created or updated." It runs "in a temporary Machine using the newly built image, once per deploy attempt", has "full access to the network, environment variables and secrets", and "A non-zero exit status from this command will stop the deployment." Default timeout 5 min (`release_command_timeout`) ([Fly config](https://fly.io/docs/reference/configuration/)).
- Consequence: `drizzle-kit` and `drizzle.config.ts` must be in the production image, so keep `drizzle-kit` in `dependencies`, not `devDependencies`. The alternative (Drizzle "Option 4") is a tiny script calling `migrate()` from `drizzle-orm/node-postgres/migrator` on startup; that runs on every machine boot instead of once per deploy, so stick with the release command.

```toml
# fly.toml
[deploy]
  release_command = "npx drizzle-kit migrate"
```

## Test database for Vitest

| | Compose Postgres | PGlite in-memory |
|---|---|---|
| Engine | Same `postgres:18` image as dev; 18.6 | WASM Postgres 18.3 (`@electric-sql/pglite` 0.5.8; verified with `select version()`) |
| Drizzle | Same `drizzle-orm/node-postgres` code path as prod | `drizzle-orm/pglite`, `drizzle-orm/pglite/migrator`; drizzle-kit `driver: 'pglite'`, `url: ':memory:'` ([Drizzle](https://orm.drizzle.team/docs/connect-pglite), [config](https://orm.drizzle.team/docs/drizzle-config-file)) |
| Isolation | Shared DB; `TRUNCATE ... CASCADE` per test or one DB per worker | Fresh instance per test file = free isolation |
| Concurrency | Real connections; pool behaviour tested | "PGlite is single user/connection" ([README](https://github.com/electric-sql/pglite)); no pool, no concurrent-connection bugs surface |
| Speed | Container already running for dev; per-test cost is a `TRUNCATE` | No Docker; WASM boot per file, then fast |
| Parity risk | None | Different build; extension set is PGlite's own ([PGlite docs](https://pglite.dev/docs/)); no PgBouncer/TLS/network path either way |

- Vitest runs files in parallel by default (`fileParallelism: true`), so with Compose either give each worker its own database (`CREATE DATABASE test_${VITEST_POOL_ID}`) or set `fileParallelism: false` for the DB suite ([Vitest](https://vitest.dev/config/fileparallelism)).
- Decision: Compose Postgres. It is the engine that runs in prod, the container is already up, and it costs no new dependency. Reach for PGlite only when tests must run without Docker (they don't: GitHub Actions has service containers).

## Surprises

- You do not need the `-pooler` URL for this shape of app at all; one direct `DATABASE_URL` is both simpler and closer to Compose.
- PGlite 0.5.x quietly moved to Postgres 18 (maintainer, 2026-06-16, [discussion #766](https://github.com/electric-sql/pglite/discussions/766)), so the PG-major parity objection to PGlite is gone; the single-connection one remains.
- The `postgres:18` image moved its volume path; copying an older compose file will silently lose data on `docker compose down`.
- Drizzle docs currently show `@rc` installs; stable 0.45.2 already has every adapter above.
