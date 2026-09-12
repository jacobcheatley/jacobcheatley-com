import { desc, isNotNull } from "drizzle-orm";
import { db } from "@/db/index.server";
import { guestbookEntries } from "./schema";

// Approved entries only (approvedAt set by the moderation CLI), newest first.
export function listApprovedEntries(limit = 100) {
  return db
    .select()
    .from(guestbookEntries)
    .where(isNotNull(guestbookEntries.approvedAt))
    .orderBy(desc(guestbookEntries.createdAt), desc(guestbookEntries.id))
    .limit(limit);
}
