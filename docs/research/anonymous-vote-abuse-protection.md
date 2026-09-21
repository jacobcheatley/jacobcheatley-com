# What is the least abuse protection for anonymous Votes?

Research for ticket 148 (map 146), checked on 2026-09-21. Installed versions read from
`node_modules`: `@tanstack/react-start` 1.168.52, `@tanstack/start-server-core` 1.169.34,
`@tanstack/react-router` 1.170.35, `h3-v2` 2.0.1-rc.20, `cookie-es` 3.1.1, `zod` ^4.6,
`drizzle-orm` 0.45.2, `pg` 8.23.0, Bun 1.4.2. API claims marked **[d.ts]** were read from
the installed type declarations, not only from docs. Nothing here was executed.

Already decided and not revisited: anonymous cookie id, one Vote per Matchup per voter by
unique constraint, no accounts, a cookie-clearing attacker is accepted. The goal is only
that a casual script cannot flood the votes table.

## Recommendation

**An in-memory fixed-window counter keyed by the `Fly-Client-IP` header, checked in the
Vote server function before the insert. A plain random-UUID voter id in an unsigned
`httpOnly` cookie, minted on the first Vote. No new dependency, no new table, no
migration.**

Why that is enough: the unique constraint already caps one voter id at one row per
Matchup (435 rows for 30 Elements). The only way to flood is to mint voter ids, and a
script can mint them for free whether the cookie is signed or not (drop the cookie, get a
new one). So the thing that needs a cap is Votes per network address, and that one check
covers forged ids, cleared cookies and replayed requests alike.

Shape, about 15 lines, all platform or installed APIs:

```ts
// vote-limit.ts: pure, unit-testable without a database or a Start context
export function createFixedWindowLimiter(limit: number, windowMs: number) {
  let windowStartMs = 0;
  const counts = new Map<string, number>();
  return (key: string, nowMs: number) => {
    if (nowMs - windowStartMs >= windowMs) {
      counts.clear(); // one shared window: the Map cannot grow without bound
      windowStartMs = nowMs;
    }
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return count <= limit;
  };
}
```

```ts
// in the Vote server function (*.fn.ts), before the insert
import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
const clientIp = getRequestHeader("fly-client-ip");
const voterId = z.uuid().safeParse(getCookie("voter")).data ?? crypto.randomUUID();
setCookie("voter", voterId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60 });
```

A rate-limited Vote is an expected outcome, so the function returns a discriminated
result (`{ status: "rate-limited" }`) rather than throwing, per the coding standards.
`setResponseStatus(429)` **[d.ts]** is available if the status code should say so too.

Nothing in the repo reads a cookie or a request header today (`grep` for `cookie`,
`getRequestHeader`, `x-forwarded` under `src/` and `server.ts` finds nothing), so there
is no existing helper to reuse. The pattern to copy is Sticky Notes: a thin
`createServerFn` wrapper in `*.fn.ts` over tested helpers in `*.server.ts`
(`src/projects/sticky-notes/sticky-notes.fn.ts`). The limiter above is the testable
helper; the cookie and header calls stay in the thin wrapper because they need a Start
context and cannot run in Vitest.

## Open choices for the owner

- **The limit numbers.** A fast voter on a phone casts perhaps 20 to 30 Votes a minute,
  and a whole household, office or mobile carrier can sit behind one address (StrawPoll
  documents this failure for IP checks, below). Suggested starting point: 60 Votes per
  minute per address. That bounds a single-address script to 86,400 rows a day worst
  case; add a second, longer window (for example 1,500 per day) only if that bound is
  too loose. One limiter instance per window.
- **IPv6.** A home IPv6 user owns a whole /64, so a script that rotates addresses inside
  it defeats a per-address key. Keying IPv6 on the first four hextets closes that. It is
  beyond "casual script"; skip until seen.
- **Missing header.** `Fly-Client-IP` is absent under `bun run dev` and Playwright. Pick
  one: a fixed `"local"` key off Fly, or throw in production when it is missing.
- **`secure: true` locally.** MDN says the https requirement is ignored on localhost, so
  Chrome and Firefox accept the cookie over `http://localhost`. Safari has not always
  honoured that exception. If the owner tests in Safari locally, set `secure` from
  `NODE_ENV === "production"` instead.
- **Cookie name.** `voter` above is a placeholder.

## Findings

### The real client IP behind Fly's proxy

- Fly Proxy adds `Fly-Client-IP`: "The IP address of the client from the perspective of
  Fly Proxy." With no other proxy or CDN in front (the case here), that is the visitor.
  [Fly request headers](https://fly.io/docs/networking/request-headers/)
- `X-Forwarded-For` is the wrong source. Fly's page says it "must be treated with caution
  to avoid spoofing attempts" and defers to MDN's parsing advice, under which only the
  entries added by your own proxies are trustworthy and the leftmost ones are whatever
  the client sent. The installed `getRequestIP({ xForwardedFor: true })` takes the
  *first* entry (`_header.split(",")[0]` in `h3-v2/dist/h3-*.mjs`), the least
  trustworthy one. Do not use it.
  [MDN X-Forwarded-For](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For)
- `getRequestIP()` without options returns `event.req.context?.clientAddress ||
  event.req.ip`. `server.ts` hands `start.fetch` a bare `Request` from `Bun.serve`, so
  both are undefined, and behind a proxy the socket address would be Fly's anyway.
- Read the header with `getRequestHeader(name): string | undefined` **[d.ts]**
  (`start-server-core/dist/esm/request-response.d.ts`, re-exported by
  `@tanstack/react-start/server`). Header lookup is case-insensitive (`Headers.get`).
  Documented in the
  [server functions guide](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions),
  "Server Context & Request Handling".
- If Cloudflare or another CDN is ever put in front, `Fly-Client-IP` becomes the CDN's
  address and every visitor shares one bucket. Revisit then.

### In-memory vs Postgres-backed, and what restarts and a second machine do

| | In-memory `Map` | Postgres fixed-window upsert |
| --- | --- | --- |
| New machinery | one pure function | a table, a migration, an upsert, a cleanup story |
| Cost per Vote | none | one more round trip to Neon |
| Stores IP addresses | never on disk | yes, until deleted |
| Deploy or cold boot | counters reset: an attacker gets one extra window | unaffected |
| Autostop `suspend` (this app's setting) | counters survive: suspend snapshots memory | unaffected |
| A second Machine | each counts alone, so the effective limit is about 2× | one shared limit |
| Clock | `Date.now()`, can be stale right after a resume | use the database's `now()`, never the Machine's clock |

- This app runs `auto_stop_machines = "suspend"`, `min_machines_running = 0`, one
  shared-cpu-1x 512 MB Machine (`fly.toml`). Suspend writes "the entire contents of the
  Machine's memory to disk" and resumes from it, for Machines up to 2 GiB; Machines are
  stopped, not suspended, before a deploy, so a deploy is a cold boot. The clock can be
  out of sync just after a resume.
  [Autostop/autostart](https://fly.io/docs/launch/autostop-autostart/),
  [Autosuspend announcement](https://community.fly.io/t/autosuspend-is-here-machine-suspension-is-enabled-everywhere/20942)
- A Machine only stops or suspends when idle, and a script that is flooding keeps it
  awake, so the reset cannot be triggered by the attacker. Deploys are the owner's.
  Every reset costs at most one extra window of Votes. That is inside the goal.
- Fly Proxy sends each request to "the least loaded, closest Machine" with no stickiness
  by default, so with two Machines a client's requests split across two counters.
  [Load balancing](https://fly.io/docs/reference/load-balancing/). A 2× limit is still a
  limit. Check the real count with `fly scale show`: `fly launch` and a first `fly
  deploy` create "two Machines for process groups with services", and this app has an
  `http_service`, so there may be two unless it was scaled to one.
  [App availability](https://fly.io/docs/apps/app-availability/)
- The Postgres version, for when it is needed (several Machines with a tight limit, or a
  limit that must survive deploys). `INSERT ... ON CONFLICT DO UPDATE` "guarantees an
  atomic INSERT or UPDATE outcome ... even under high concurrency", and `RETURNING`
  gives the new count in the same statement.
  [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)

  ```sql
  -- vote_rate_windows(client_ip text, window_start timestamptz, vote_count int,
  --                   primary key (client_ip, window_start))
  insert into vote_rate_windows (client_ip, window_start, vote_count)
  values ($1, date_trunc('minute', now()), 1)
  on conflict (client_ip, window_start)
  do update set vote_count = vote_rate_windows.vote_count + 1
  returning vote_count;
  ```

  Drizzle 0.45 expresses this with `.onConflictDoUpdate({ target, set })` and
  `.returning()`. Old windows need deleting (piggyback a `delete ... where window_start <
  now() - interval '1 day'` on a small fraction of requests; there is no scheduled job in
  this project by decision). This is the upgrade path, not the recommendation.
- Rejected without building: counting recent rows in the votes table by IP. It needs no
  new table but puts an IP address on every Vote row forever.
- Rejected: a rate-limit package (`rate-limiter-flexible` and friends). The function
  above is smaller than the configuration.

### A long-lived httpOnly cookie id in TanStack Start server functions

- `getCookie(name): string | undefined`, `setCookie(name, value, options?:
  CookieSerializeOptions)`, `getCookies()`, `deleteCookie()` **[d.ts]**, same file and
  same `@tanstack/react-start/server` export as above. None is marked `@deprecated`. They
  wrap `h3-v2` and find the request through `AsyncLocalStorage`, so they work anywhere
  inside a server function handler and throw "No StartEvent found" outside one. The
  options type is `cookie-es`'s: `httpOnly`, `secure`, `sameSite: "lax" | "strict" |
  "none"`, `path`, `maxAge` (seconds), `expires`.
- The docs' server functions guide lists the header helpers but not the cookie ones; the
  cookie helpers are real exports all the same, and the
  [authentication guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
  sets its session cookie from inside a POST server function the same way.
- **Mint on the first Vote, not on page load.** A voter who has not voted has seen no
  Matchup, so nothing needs their id before then. It keeps `Set-Cookie` in a browser-made
  POST (the well-trodden path) rather than in a loader during SSR, and visitors who never
  vote never get a cookie.
- Parse the cookie at the boundary with `z.uuid()` (zod 4). A missing or malformed value
  gets a fresh `crypto.randomUUID()` (web platform, in Bun). Without the parse a
  hand-edited cookie reaches a `uuid` column and the insert throws.
- Attributes ([MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)):
  - `HttpOnly`: page script never needs the id; the browser still sends it on `fetch`.
  - `SameSite=Lax`: the Vote POST is same-site, so it is sent; a cross-site POST from
    another page does not carry it. Some browsers already default to Lax; say it anyway.
  - `Secure`: prod is https only (`force_https = true`).
  - `Path=/`, no `Domain`. `CANONICAL_HOST` redirects everything to one host, so a
    host-only cookie is right. The `__Host-` prefix is not worth it: it hard-requires
    `Secure`, which complicates local http.
  - `Max-Age`: browsers clamp to 400 days. Chrome since M104: longer lifetimes are not
    rejected, "their expiration date is set to 400 days instead"; the limit is in the
    rfc6265bis draft. [Chrome: cookie Expires and Max-Age](https://developer.chrome.com/blog/cookie-max-age-expires)
    Set `maxAge` to 400 days and re-send the cookie on every Vote: that slides the expiry
    for free, so an active voter never loses their id.
  - Safari's 7-day ITP cap applies to "cookies created in JavaScript", not to first-party
    cookies set by an HTTP response, so a server-set cookie keeps its full lifetime.
    [WebKit tracking prevention](https://webkit.org/tracking-prevention/)

### Does signing the cookie buy anything?

No. A signature stops a client from choosing its own id. Here that prevents nothing:

- Impersonating another voter means guessing a 122-bit random UUID, and there is nothing
  to gain from it: a Vote is final and a voter has no private data.
- Minting ids without asking the server is no easier than deleting the cookie and asking
  the server, which is already accepted.

Signing only matters if issuing an id is itself rate-limited or recorded (a `voters`
table), and the per-address Vote limit already covers that attack with less. Start does
ship `useSession` (encrypted, signed cookie sessions, needs a 32-character secret
**[d.ts]**); it would add a secret to manage for no gain. Skip it.

### What comparable anonymous-voting sites do

- StrawPoll offers exactly these layers as a per-poll choice: IP address ("does not work
  if your voters share the same network/wifi, such as in schools, universities or
  workplaces"), browser cookie (one vote per browser, many per address), or none.
  [StrawPoll: duplication checking](https://support.strawpoll.me/hc/en-us/articles/219430887-Duplication-Checking)
  The lesson: IP is for throttling, the cookie is for identity. Using IP as identity
  locks out shared networks, which is why the limit here is a generous rate and not "one
  voter per address".
- Sites that need more than that add a CAPTCHA or sign-in. Both are out of scope here,
  and a CAPTCHA would wreck the phone voting feel. If a flood ever does get through, the
  raw one-row-per-Vote storage means it can be deleted by voter id or by time range in
  SQL after the fact.
