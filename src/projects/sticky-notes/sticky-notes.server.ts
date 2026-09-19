import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/index.server";
import type { NoteSubmission } from "./note-schema";
import { stickyNotes } from "./schema";

// approvedAt stays null until the approval CLI sets it, so the note is pending.
export async function addNote(note: NoteSubmission) {
  const [row] = await db
    .insert(stickyNotes)
    .values(note)
    .returning({ id: stickyNotes.id });
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

export function listApprovedNotes(limit = 100) {
  return db
    .select()
    .from(stickyNotes)
    .where(isNotNull(stickyNotes.approvedAt))
    .orderBy(desc(stickyNotes.createdAt), desc(stickyNotes.id))
    .limit(limit);
}

export function listPendingNotes() {
  return db
    .select()
    .from(stickyNotes)
    .where(isNull(stickyNotes.approvedAt))
    .orderBy(desc(stickyNotes.createdAt), desc(stickyNotes.id));
}

// Returns rows affected: 1 on success, 0 for an unknown or already-approved id.
export async function approveNote(id: number) {
  const rows = await db
    .update(stickyNotes)
    .set({ approvedAt: new Date() })
    .where(and(eq(stickyNotes.id, id), isNull(stickyNotes.approvedAt)))
    .returning({ id: stickyNotes.id });
  return rows.length;
}
