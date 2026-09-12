import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const guestbookEntries = pgTable("guestbook_entries", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 50 }).notNull(),
  message: varchar({ length: 500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // null = pending; the moderation CLI is the only writer of approvedAt.
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});
