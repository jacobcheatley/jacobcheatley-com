import { desc, isNotNull } from "drizzle-orm";
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
