import { z } from "zod";
import { type NoteContent, noteSchema } from "./note-schema";

// A visitor's own just-submitted notes, kept in their browser only: a list,
// newest first, capped at MAX_PENDING. One shared contract, so the editor and
// the wall agree on the key and the shape.

const KEY = "sticky-notes:pending";

// Stripping where the write path is strict: a stored entry may carry keys this
// build has no use for. The timestamp is debug-only, so one without it reads.
const pendingNoteSchema = noteSchema
  .extend({ submittedAtMs: z.number().catch(0) })
  .strip();

export type PendingNote = z.infer<typeof pendingNoteSchema>;

// Recursively key-sorted JSON. Approved content comes back through a Postgres
// jsonb column, which does not preserve object key order. Arrays keep theirs:
// z-order and stroke points are meaningful.
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
// content means this very note is now on the wall from the server.
// ponytail: canonical-JSON equality; a stored hash would only beat
// re-serialising under real submission volume.
export function isApproved(
  pending: PendingNote,
  approved: readonly { author: string; content: NoteContent }[],
): boolean {
  const content = canonical(pending.content);
  return approved.some(
    (n) => n.author === pending.author && canonical(n.content) === content,
  );
}

// A courtesy overlay, not a record: past this many, the oldest pending note
// just stops being shown.
export const MAX_PENDING = 10;

// localStorage can throw (private mode, disabled storage) and a missing overlay
// is harmless, so every access swallows failure. Entries are parsed against the
// real write-path schema: the wall hands them straight to NoteRender.
export function readPending(): PendingNote[] {
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  // an older stored value is a single note, not a list
  const list: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  return list.flatMap((entry) => {
    const note = pendingNoteSchema.safeParse(entry);
    return note.success ? [note.data] : [];
  });
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

// Persists what is left, so the wall stops overlaying the copies the server
// now serves.
export function reconcilePending(
  list: readonly PendingNote[],
  approved: readonly { author: string; content: NoteContent }[],
): PendingNote[] {
  const remaining = list.filter((p) => !isApproved(p, approved));
  write(remaining);
  return remaining;
}
