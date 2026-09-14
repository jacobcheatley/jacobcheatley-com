import type { NoteContent } from "./note-schema";

// A visitor's own just-submitted note, kept in their browser only. The editor
// (#61) writes it on submit; the wall (#60) shows it pending at the newest slot
// until it appears approved in the server list, then drops it. One shared
// contract so both sides agree on the key and shape. It is an optimistic local
// overlay, never an endpoint — losing it costs nothing.

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

// localStorage can throw (private mode, disabled storage); a missing overlay is
// harmless, so every access swallows failure and degrades to "no pending note".
export function readPending(): PendingNote | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingNote) : null;
  } catch {
    return null;
  }
}

export function savePending(note: PendingNote): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(note));
  } catch {
    // overlay is a nicety, not load-bearing
  }
}

export function clearPending(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
