import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  smallint,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ELEMENT_KINDS, type VoteValue } from "./showdown-schema";
import type { Voter } from "./voter-cookie";

// The roster the migration seeds and the owner tunes with SQL from then on.
// Ids are never reused or reassigned: a Vote points at one forever.
export const elements = pgTable("elements", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 30 }).notNull().unique(),
  emoji: varchar({ length: 16 }).notNull(),
  colour: varchar({ length: 7 }).notNull(),
  kind: varchar({ length: 6, enum: ELEMENT_KINDS }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

// The DOM has an `Element` of its own, so the roster's row wears the Project's
// name the way a Sticky Note's `NoteElement` wears its own.
export type ShowdownElement = typeof elements.$inferSelect;

// A Matchup is the Element self-join on `element_low < element_high`, so it
// has one orientation here and a positive `value` means the low id wins. No
// cascade: an Element with Votes cannot be deleted, only switched off.
export const votes = pgTable(
  "votes",
  {
    voter: uuid().$type<Voter>().notNull(),
    elementLow: integer("element_low")
      .notNull()
      .references(() => elements.id),
    elementHigh: integer("element_high")
      .notNull()
      .references(() => elements.id),
    value: smallint().$type<VoteValue>().notNull(),
    castAt: timestamp("cast_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("votes_value_step", sql`${table.value} between -2 and 2`),
    check(
      "votes_element_order",
      sql`${table.elementLow} < ${table.elementHigh}`,
    ),
    unique("votes_voter_matchup").on(
      table.voter,
      table.elementLow,
      table.elementHigh,
    ),
  ],
);
