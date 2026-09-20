import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  // biome-ignore lint/suspicious/noDeprecatedImports: only primaryKey's varargs overload is deprecated, and this table calls the object one.
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar({ length: 80 }).notNull().unique(),
  title: varchar({ length: 120 }).notNull(),
  tagline: varchar({ length: 160 }).notNull(),
  body: text().notNull(),
  // The only state an Article has: none is a Draft, a future one is Scheduled,
  // one that has arrived is Published.
  publishAt: timestamp("publish_at", { withTimezone: true }),
});

export const topics = pgTable(
  "topics",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 30 }).notNull(),
  },
  // A Topic exists once across the Blog whatever case it is written in.
  (table) => [uniqueIndex("topics_name_lower").on(sql`lower(${table.name})`)],
);

export const articleTopics = pgTable(
  "article_topics",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.articleId, table.topicId] })],
);

// An Article's Topics as one array column, for a select that left-joins both
// Topic tables and groups by the Article. Empty, not [null], for no Topics.
export const topicNames = sql<
  string[]
>`coalesce(array_agg(${topics.name}) filter (where ${topics.name} is not null), '{}')`;
