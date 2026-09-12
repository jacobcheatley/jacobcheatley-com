import { desc, isNotNull } from "drizzle-orm";
import { db } from "@/db/index.server";
import type { EntryInput } from "./entry-schema";
import { guestbookEntries } from "./schema";

// Inserts a pending entry (approvedAt stays null until the moderation CLI
// approves it) and returns its id.
export async function addEntry(entry: EntryInput) {
  const [row] = await db
    .insert(guestbookEntries)
    .values(entry)
    .returning({ id: guestbookEntries.id });
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

// Approved entries only (approvedAt set by the moderation CLI), newest first.
export function listApprovedEntries(limit = 100) {
  return db
    .select()
    .from(guestbookEntries)
    .where(isNotNull(guestbookEntries.approvedAt))
    .orderBy(desc(guestbookEntries.createdAt), desc(guestbookEntries.id))
    .limit(limit);
}
