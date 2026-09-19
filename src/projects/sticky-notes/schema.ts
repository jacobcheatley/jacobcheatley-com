import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type { NoteContent } from "./note-schema";

export const stickyNotes = pgTable("sticky_notes", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  author: varchar({ length: 50 }).notNull(),
  content: jsonb().$type<NoteContent>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // null = pending; the approval CLI is the only writer of approvedAt.
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});
