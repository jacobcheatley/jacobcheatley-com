import { type NoteContent, noteSchema } from "./note-schema";

// A visitor's own just-submitted notes, kept in their browser only: a list,
// newest first, capped at MAX_PENDING. The editor (#61) prepends one on submit;
// the wall (#60) shows them at the newest slots until each turns up approved in
// the server list, then drops it. One shared contract so both sides agree on
// the key and shape. It is an optimistic local overlay, never an endpoint —
// losing it costs nothing, so every read is defensive rather than repaired.

const KEY = "sticky-notes:pending";

export type PendingNote = {
  author: string;
  content: NoteContent;
  submittedAt: number; // ms epoch; for debugging, not shown
};

// Recursively key-sorted JSON. Approved content comes back through a Postgres
// jsonb column, which does NOT preserve object key order, so a plain
// JSON.stringify of the two blobs would differ even for the same note. Arrays
// keep their order (z-order and stroke points are meaningful) — only object
// keys are sorted.
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortKeys(obj[k])]),
    );
  }
  return value;
}

// The submitter never learns the DB id (submit returns only "pending"), so a
// pending note is reconciled by its payload: same author and canonically-equal
// content means the CLI approved this very note and it is now on the wall from
// the server. ponytail: canonical-JSON equality — fine at personal scale; only
// under real submission volume would a stored hash beat re-serialising.
export function isApproved(
  pending: PendingNote,
  approved: readonly { author: string; content: NoteContent }[],
): boolean {
  const content = canonical(pending.content);
  return approved.some(
    (n) => n.author === pending.author && canonical(n.content) === content,
  );
}

// A visitor can have several notes awaiting approval at once, so the stored
// value is a list, newest first. Capped because it is a courtesy overlay, not a
// record: past this many, the oldest pending note just stops being shown.
export const MAX_PENDING = 10;

// localStorage can throw (private mode, disabled storage); a missing overlay is
// harmless, so every access swallows failure and degrades to "nothing pending".
// Entries are validated against the real write-path contract, not just probed
// for a `content` key: the wall hands whatever comes back straight to
// NoteRender, which would throw on a half-shaped note from an older format or a
// hand-edited key.
export function readPending(): PendingNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // the key held a single note before #71 — read it as a one-entry list
    const list: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    return list.flatMap((entry) => {
      const n = entry as Partial<PendingNote> | null;
      const note = noteSchema.safeParse({
        author: n?.author,
        content: n?.content,
      });
      if (!note.success) return [];
      // submittedAt is debug-only, so a legacy entry without one still shows
      const submittedAt =
        typeof n?.submittedAt === "number" ? n.submittedAt : 0;
      return [{ ...note.data, submittedAt }];
    });
  } catch {
    return [];
  }
}

function write(list: PendingNote[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // overlay is a nicety, not load-bearing
  }
}

export function savePending(note: PendingNote): void {
  write([note, ...readPending()].slice(0, MAX_PENDING));
}

// Drop the pending notes that have shown up approved and persist what's left,
// so the wall stops overlaying them on the copies the server now serves.
export function reconcilePending(
  list: readonly PendingNote[],
  approved: readonly { author: string; content: NoteContent }[],
): PendingNote[] {
  const remaining = list.filter((p) => !isApproved(p, approved));
  write(remaining);
  return remaining;
}
