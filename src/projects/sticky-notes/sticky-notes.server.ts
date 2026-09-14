import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/index.server";
import type { NoteSubmission } from "./note-schema";
import { stickyNotes } from "./schema";

// Inserts a pending note (approvedAt stays null until the approval CLI sets it)
// and returns its id.
export async function addNote(note: NoteSubmission) {
  const [row] = await db
    .insert(stickyNotes)
    .values(note)
    .returning({ id: stickyNotes.id });
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

// Approved notes only (approvedAt set by the approval CLI), newest first.
export function listApprovedNotes(limit = 100) {
  return db
    .select()
    .from(stickyNotes)
    .where(isNotNull(stickyNotes.approvedAt))
    .orderBy(desc(stickyNotes.createdAt), desc(stickyNotes.id))
    .limit(limit);
}

// Pending notes (approvedAt still null), newest first — what the approval CLI
// renders for the owner to judge.
export function listPendingNotes() {
  return db
    .select()
    .from(stickyNotes)
    .where(isNull(stickyNotes.approvedAt))
    .orderBy(desc(stickyNotes.createdAt), desc(stickyNotes.id));
}

// Approves a note that is still pending. Returns rows affected: 1 on success,
// 0 for an unknown or already-approved id (nothing changes either way).
export async function approveNote(id: number) {
  const rows = await db
    .update(stickyNotes)
    .set({ approvedAt: new Date() })
    .where(and(eq(stickyNotes.id, id), isNull(stickyNotes.approvedAt)))
    .returning({ id: stickyNotes.id });
  return rows.length;
}
