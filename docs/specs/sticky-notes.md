# Sticky Notes — build spec

Build-ready handoff for **Sticky Notes**, the diegetic note-wall Project at `/sticky-notes`
that replaces the guestbook. Everything here is decided; nothing is left to design. It was
charted on the [Sticky Notes wayfinder map](https://github.com/jacobcheatley/jacobcheatley-com/issues/45)
(issue #45), one decision per closed child ticket — those tickets are the source of truth and
are linked inline as `(#nn)`.

Domain vocabulary (Note, Element, Stroke, Text box, Sticker, Ink, Fastener, Curl) is defined in
`CONTEXT.md` → **Sticky Notes**. Use those terms; don't drift to synonyms.

## What it is

A visitor draws a single sticky note in a full-screen editor — freehand marker strokes,
text boxes, and emoji stickers on a coloured paper — then "pins" it to a corkboard wall.
The note stays **pending** until the owner approves it from a CLI; only approved notes reach
the public wall. The whole thing mirrors the guestbook's storage + moderation shape, with the
note's visual content stored as a versioned JSON blob in a JSONB column instead of a text
message.

Sticky Notes is its own Project with its own look, deliberately distinct from the serif
tree-frog-green Portfolio home.

## Stack

TS 7, React 19 + TanStack Start/Router, Tailwind 4, drizzle + Neon Postgres (node-postgres
driver), zod 4. Fonts via fontsource. Editor drawing via `perfect-freehand` (MIT, ~2.5 KB) —
no canvas library.

## Suggested build order

The pieces have real dependencies; this order keeps each step compilable:

1. **Storage + schema first** (§Storage). `sticky_notes` table, the zod content contract, the
   `0000` baseline rewrite, and repointing `db/index.server.ts` — done in the **same change**
   that deletes the guestbook (§Retire the guestbook), because `db/index.server.ts` needs a
   schema to import at all times.
2. **`NoteRender`** (§Wall) — the pure JSON→SVG renderer. Everything else consumes it:
   editor, wall, zoom, and the CLI preview. Build and test it in isolation first.
3. **Wall / read view** (§Wall) — the read path (server fn + loader + route), reusing
   guestbook plumbing, rendering with `NoteRender`.
4. **Editor** (§Editor) — the client-only island at `/sticky-notes/new` that emits the note
   JSON, layered over `NoteRender`.
5. **Approval CLI** (§Approval CLI) — `bun run sticky-notes`, reusing `db`, the schema, and
   `NoteRender`.

---

## Data model (#51)

The submit payload is `{ author, content }`. **`author` and the timestamps are DB columns,
not part of the blob.** `content` is the versioned JSON that goes in the JSONB column — produced
by the editor, consumed by the wall and the approval CLI.

```jsonc
{
  "version": 1,
  "w": 500,
  "h": 500,
  "colour": "yellow",          // note paper colour — semantic enum key
  "rotation": -2,              // degrees
  "curl": 0.3,                // 0..1 corner-peel intensity
  "fastener": "pin",          // pin | tape | staple | stick
  "elements": [               // ordered; array order IS z-order (later draws on top)
    { "type": "stroke",  "ink": "red",  "size": 8,
      "points": [[x, y, pressure], /* ... */] },
    { "type": "text",    "x": 40, "y": 60, "w": 180, "text": "hi",
      "font": "casual", "color": "black", "fontSize": 24, "rotation": 0 },
    { "type": "sticker", "x": 120, "y": 90, "emoji": "⭐", "scale": 1, "rotation": 0 }
  ]
}
```

Decisions that shape it:

- **Coordinate space** — fixed note-local pixel space. `w`/`h` travel with the note; the wall
  and editor scale it uniformly. Canvas is **500×500** (§Storage locks and enforces this).
- **Colours are semantic enum keys, not hex.** The shade mapping lives in render code, so
  shades can be re-tuned without migrating stored notes.
  - **Ink** (stroke + text `color`): `black | green | red | blue`. Text takes Ink colours — it
    is not freeform-coloured.
  - **Note `colour`** (paper): fixed palette `yellow | pink | blue | green | orange | white`.
    A different set from Ink.
- **Note-level fields live in `content`** (not extra columns): `version, w, h, colour,
  rotation, curl, fastener, elements`.
- **Stroke** stores **raw input points** `[x, y, pressure]`, *not* the rendered outline —
  `perfect-freehand` regenerates the outline at render, keeping the blob small and re-tunable.
  `size` = base stroke px in the logical canvas.
- **Text box** = a fixed-width wrap box: stores `w`, `fontSize`, `rotation`. `font` is the #48
  enum key (`print | handwritten | casual | marker`). **No `weight`** (add via version bump if
  Caveat weight-tuning ever ships).
- **Sticker** = emoji + position + `scale` + `rotation`.
- **z-order = array order.** No stable element `id` in the stored JSON — selection / object-erase
  / no-undo are editor-runtime state, not persisted.
- **`version: 1`** integer at the root, for forward migration.

---

## Storage + write path (#52)

### `sticky_notes` table (drizzle)

Mirror `guestbook_entries` exactly, swapping the text `message` for a JSONB `content` and
renaming `name` → `author`:

| column | type | notes |
|---|---|---|
| `id` | `integer` PK, `generatedAlwaysAsIdentity()` | |
| `author` | `varchar({ length: 50 })` NOT NULL | freeform name |
| `content` | **`jsonb`** NOT NULL | the data-model blob above |
| `created_at` | `timestamp({ withTimezone: true })` NOT NULL `defaultNow()` | |
| `approved_at` | `timestamp({ withTimezone: true })` **nullable** | `null` = pending; the approval CLI is the **only** writer |

- **Pending vs approved = nullable `approved_at`.** No status enum (matches guestbook; the CLI
  never needs a third state).
- **No indexes.** Wall query is `WHERE approved_at IS NOT NULL ORDER BY created_at DESC LIMIT 100`;
  CLI lists `WHERE approved_at IS NULL`. Both are trivial seq-scans at personal scale — add a
  partial index only if note count ever makes it matter (YAGNI).
- **Server helpers** mirror `guestbook.server.ts`:
  - `addNote({ author, content })` — inserts pending, returns the new id.
  - `listApprovedNotes(limit = 100)` — `isNotNull(approvedAt)`, `orderBy(desc(createdAt),
    desc(id))`, `limit`.
- **Server functions** mirror `guestbook.fn.ts`: `listNotesFn` (GET) and `addNoteFn` (POST)
  with `.validator(noteSchema)` as the trust boundary.

### Canvas ownership

- **Server owns the canvas as a constant: `500` (square).**
- `w`/`h` stay in the stored JSON (forward-compat) but the write path **validates `w === h ===
  500`** and rejects otherwise. This makes every coordinate bound concrete and kills the
  `w: 1e9` giant-canvas attack. If the canvas ever changes, bump the constant **and** `version`
  together.

### Write-path zod contract

Same pattern as `entry-schema.ts`: **one zod module, no server imports**, imported by both the
server fn's `.validator` and the in-browser form check. All object schemas are **`.strict()`**
(reject unknown keys — catches editor bugs and junk payloads).

- **Payload** = `{ author, content }`.
  - `author`: `z.string().trim().min(1).max(50)`, no newlines / control chars.
- **`content`**:
  - `version`: `z.literal(1)`.
  - `w`, `h`: `=== 500`.
  - `colour`: enum `yellow | pink | blue | green | orange | white`.
  - `rotation`: `-180 … 180`.
  - `curl`: `0 … 1`.
  - `fastener`: enum `pin | tape | staple | stick`.
  - `elements`: **discriminated union on `type`**, array (caps below):
    - **stroke** — `ink` ∈ `black|green|red|blue`; `size` `1…48`; `points` = array of
      `[number, number, number]` triples, x/y `-50…550`, pressure `0…1`.
    - **text** — `x`/`y` `-50…550`; `w` `20…500`; `text` (see text handling); `font` ∈
      `print|handwritten|casual|marker`; `color` ∈ Ink enum; `fontSize` `8…96`; `rotation`
      `-180…180`.
    - **sticker** — `x`/`y` `-50…550`; `emoji` validated against a **closed curated allowlist**
      (the editor's sticker sheet; exact members a build detail); `scale` `0.25…4`; `rotation`
      `-180…180`.

### Abuse caps

| Guard | Value |
|---|---|
| Request body hard cap (backstop) | **256 KB** |
| Max elements (all types) | **80** |
| Max points per stroke | **1000** |
| Max total points across all strokes | **20 000** |
| Max text length per text box | **280** chars |
| `fontSize` | 8–96 |
| stroke `size` | 1–48 |
| sticker `scale` | 0.25–4 |
| rotation (note + elements) | −180…180 |
| `curl` | 0…1 |
| coords x/y (+ stroke point x/y) | −50…550 |
| stroke `pressure` | 0…1 |
| text box `w` | 20…500 |

### Text handling at the boundary

- `author`: `.trim()`, 1–50, **no newlines / control chars**.
- text-box `text`: `.trim()`, ≤ 280, **allow `\n`**, strip all other control chars.
- The 256 KB body cap is the backstop; the element/point caps are the real guards (a full note
  is well under it).

---

## Editor approach (#47, #50)

**Hand-rolled, locked.** The editor is a **client-only island**: SVG for the note surface,
text, and stickers; `perfect-freehand` (~2.5 KB, MIT) for marker strokes. No canvas library.
State is a plain data object we own → straight into the JSONB column.

- react-konva was prototyped as the one comparison library and dropped: it adds ~50 KB and a
  coupled scene-graph schema for no feel advantage. tldraw (licence/watermark), Excalidraw
  (opaque schema, no SSR, heavy), and Fabric (imperative, no React binding) were eliminated in
  the survey (#47).
- **Strokes** capture **raw input points** `[x, y, pressure]`; `perfect-freehand`'s `getStroke`
  regenerates the filled outline path at render. Pointer Events feed pressure; touch/mobile
  drawing is **in scope** and must work.
- **Text** is edited inline via a real HTML `<input>`/`<textarea>` overlay, then stored as the
  text element.
- **Stickers** are emoji placed from the sticker sheet.
- Prototypes captured on `prototype/50-editor-engine` (handrolled vs konva, with a live JSON
  readout). Both had rough edges (inline-text commit, drag-off hit-testing) — those are
  **build-time bugs to iron out**, not open decisions.

---

## Fonts (#48)

Four text-box fonts, all fontsource, all OFL-1.1 or Apache-2.0. The enum key is what the data
model stores:

| Enum key | Role | Font | fontsource package | Notes |
|---|---|---|---|---|
| `print` | Basic print | IBM Plex Sans | `@fontsource/ibm-plex-sans` | **already installed** — reuse, add no package |
| `handwritten` | Handwritten cursive | Caveat | `@fontsource-variable/caveat` | variable (`wght` 400–700), ~73 KB |
| `marker` | Marker | Permanent Marker | `@fontsource/permanent-marker` | static 400, ~28 KB |
| `casual` | Casual print handwriting | Patrick Hand | `@fontsource/patrick-hand` | static 400, ~23 KB — **editor default** |

- **Lazy-load per selection** — only fetch the face a note actually uses, not eagerly in the
  bundle (~124 KB for the three new faces combined).
- Newsreader (serif) stays reserved for site chrome, not a note option.

---

## Visual direction (#49)

Two worlds, one note object. Distinct from the tree-frog-green Portfolio. Reference mockups on
`prototype/49-sticky-look` ([`prototypes/49-sticky-look.html`](https://github.com/jacobcheatley/jacobcheatley-com/blob/prototype/49-sticky-look/prototypes/49-sticky-look.html),
UX research [`prototypes/49-tool-ux-research.md`](https://github.com/jacobcheatley/jacobcheatley-com/blob/prototype/49-sticky-look/prototypes/49-tool-ux-research.md)) — not merged.

- **Wall (read view):** warm **corkboard**. Approved notes with slight rotation, each showing
  its fastener.
- **Editor:** a cool **slate cutting-mat desk** (faint grid). Deliberately not the green home.
- **The note object** is identical in both worlds; only the surround changes. Medium
  skeuomorphism: soft drop shadow, slight corner curl, gentle rotation, faint paper grain.
  Paper colour / rotation / curl / fastener are **seeded-random per note, lightly adjustable**
  within a small range via diegetic corner/rotate handles.

### Editor interaction (mobile-first)

- **In-hand tool model** — the active tool lifts out of a wooden bottom tray (thumb zone).
  Scales up (tray → left rail, note grows) on larger screens.
- **One marker whose colour *is* the ink**; long-press → radial **colour fan** to change ink.
- **Tweezers = select / move.** **Drag an object off the note to delete it.**
- **Eraser = object-level removal** (whole stroke / text box). **No undo** — removal is physical.
- **Stickers and the font list live in a pull-up bottom sheet** (peel & drag onto the note).
- **Contextual inline toolbar** on a selected object (fonts + inks + bin) appears where you're
  working.
- Default font: Patrick Hand (`casual`).

### Submit & pending

- **No Submit button.** Choosing a **Fastener** (pin / tape / staple / stick) and pressing it
  to the board *is* the submit. The Fastener is **decorative + stored** (shown on the wall).
- On submit the note **shows on the corkboard immediately in a pending state**, plus a
  **localStorage copy kept until approved** by the CLI.

---

## Wall / read view (#53)

The read view is faithful to the #49 mockup. The submit "placement" is **animation-only** — no
wall coordinates are stored, and the storage `content` contract is untouched.

### Wall (`/sticky-notes`)

- **Static at page load**, approved notes only (map scope: no live updates).
- **Layout**: flex-wrap grid of ~128px note tiles in reading order, per-note CSS `rotate()`.
  **No overlap, no stored positions.** Newest-first.
- **Ordering & limit**: `approved_at IS NOT NULL`, `ORDER BY created_at DESC, id DESC`,
  `LIMIT 100`, **no pagination**. Reuses the guestbook's `listApprovedEntries` query shape — a
  `listApprovedNotesFn` server fn + route loader mirroring it.
- **Placement is theatrical**: on submit the note animates off the cutting-mat onto the grid's
  newest slot. Nothing about position is persisted.

### `NoteRender` — the one shared renderer

- **One pure, state-free `NoteRender`** — a function of the note `content` JSON. Bg rect +
  `elements[]` loop: strokes via `perfect-freehand` `getStroke` on the raw `[x,y,pressure]`
  points (filled outline path); text and emoji stickers as SVG `<text>`. `viewBox="0 0 500 500"`.
- Used by the **wall tile, the zoom view, the editor** (editor layers selection/pointer on top),
  **and the approval CLI**. Extract it once.
- Because it's pure, the **wall server-renders with no client JS to view**; only the zoom
  interaction and the own-pending overlay need client JS.
- **Rotation / curl / fastener render in CSS *around* the SVG** (rotate transform, curl
  pseudo-element, fastener child element) — not inside the SVG — matching the mockup.

### Interaction

- **Tap-to-zoom lightbox** — tap a tile → the same `NoteRender` shown large in a fixed overlay
  (128px tiles aren't legible for a 500×500 note). Tap-out / Esc closes. No prev/next. Client-only.
- **Own pending note** — prepended at the newest slot from **localStorage**, visually marked
  *pending* (faded / "awaiting approval"), reconciled away once it appears in the approved list.
  Client-only overlay, no new endpoint.
- **Empty / sparse state** — a diegetic "nothing pinned yet — pin the first note" prompt that
  doubles as the add-a-note affordance (persists smaller once notes exist).

### Entry to posting

- An "add a note" affordance on the wall → **full-screen editor on its own route**
  (`/sticky-notes/new`, TanStack flat convention). The guestbook's *combined* read+write route
  is deliberately **not** copied — the immersive in-hand editor needs its own screen.
- Submit is the in-context final step: choose the fastener (existing notes dimmed), then the
  placement animation; or go back to the editor.

---

## Approval CLI (#54)

A single bun-run TS script, **no new dependency**, reusing the app's `db`, the `stickyNotes`
schema, and the shared `NoteRender`.

- **Location / invocation:** `scripts/sticky-notes.ts`; `package.json` alias
  `"sticky-notes": "bun run scripts/sticky-notes.ts"`. Run `bun run sticky-notes <cmd>`. Bun
  runs TS directly — no tsx, no build step. Arg-parse by hand off `process.argv` (`pending` /
  `approve <id>`); no arg library.
- **`pending`** — selects `approved_at IS NULL` (newest-first), renders each note's `content`
  to inline SVG via `renderToStaticMarkup(<NoteRender … />)` (`viewBox 0 0 500 500`), writes
  them into **one self-contained HTML file** (each tile labelled with note **id** + `author`)
  to a temp path, and opens it (`xdg-open` on Linux/WSL, `open` on macOS). This is the preview
  surface — **no in-app admin route, no prod auth surface.**
- **`approve <id>`** — `UPDATE sticky_notes SET approved_at = now() WHERE id = $id AND
  approved_at IS NULL`. **Prints the target DB host** (parsed from `DATABASE_URL`) *before*
  writing; reports rows affected (0 = already approved / unknown id).
- **No `reject` (YAGNI).** The wall shows approved notes only, so an unwanted pending note is
  invisible to the public and simply lingers in the `pending` gallery. Rare deliberate removal
  is a manual row delete via `db:studio` / SQL. Documented future upgrade if the pending pile
  ever needs real triage: a `rejected_at` **soft-delete** column (noted, not built).
- **DB access:** imports the existing `db` from `@/db/index.server` (drizzle over node-postgres)
  + the `stickyNotes` schema. Same `DATABASE_URL` as the app.
- **Auth / safety:** gated **solely by possession of `DATABASE_URL`** — identical trust boundary
  to `db:migrate` / `db:studio`, which already write prod. Local-only, run by hand. The printed
  target host before each write is the guard against hitting the wrong DB.
- **Build note:** `NoteRender` must render in a non-browser context — it already SSRs on the
  wall, so `renderToStaticMarkup` works.

---

## Retire the guestbook (#46)

Do this **in the same change** that introduces sticky-notes storage — `db/index.server.ts`
needs *some* drizzle schema to import at all times, so the guestbook can't be deleted before
`sticky_notes` exists.

**Remove:**

- `src/projects/guestbook/` — all 9 files (`GuestbookForm.tsx` + test, `entry-schema.ts` +
  test, `guestbook.fn.ts`, `guestbook.server.ts` + test, `schema.ts` + test).
- `src/routes/guestbook.tsx` — the route (regenerate `routeTree.gen.ts`).
- The `<ProjectCard to="/guestbook" … />` on the Portfolio home (`src/routes/_shell.index.tsx`)
  — replace with a Sticky Notes card.

**Repoint:**

- `src/db/index.server.ts` currently imports the guestbook schema
  (`import * as schema from "@/projects/guestbook/schema"`); repoint at the new `sticky_notes`
  schema.

**Table / migration — rewrite the `0000` baseline.** The guestbook data is throwaway; drop it.
Rather than an append-only drop migration:

- Delete `drizzle/0000_quiet_shocker.sql` and `drizzle/meta/0000_snapshot.json`, reset
  `drizzle/meta/_journal.json`, and regenerate a fresh `0000` baseline for `sticky_notes` only
  (`bun run db:generate`).
- The **staging DB already has the old `0000` applied** — reset it by hand: drop
  `guestbook_entries` and the drizzle migrations-bookkeeping table, then re-migrate the clean
  baseline. Prod isn't up yet, so no concern there.

**Old URL — just 404.** `/guestbook` is removed with no redirect; it shipped days ago and has
no meaningful inbound links.

---

## Out of scope

Ruled beyond this Project's destination (from the map):

- **Editing or deleting a note after posting** — a note is immutable once submitted; only the
  approval CLI acts on it.
- **Accounts / login** — the author name stays a freeform field; no identity, no auth.
- **Real-time / live wall** — the wall renders approved notes at page load; no live updates.
- **Wall pagination / multiple corkboards** — v1 is one board, newest-first, cap 100.
  "Pan to another corkboard" is future overflow, not spec'd here.
