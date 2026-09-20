import { desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db/index.server";
import { articles, articleTopics, topics } from "./schema";

export type ListedArticle = {
  slug: string;
  title: string;
  tagline: string;
  publishAt: Date;
  topics: string[];
};

// The visibility rule lives here: a Publish date that has arrived (<= now, so a
// Scheduled Article appears on the first request past it) and nothing else. A
// Draft's null date fails the comparison, which is why publishAt is a Date in
// the result. Topics come back in no order; the reader sorts them.
export function listPublishedArticles(now: Date): Promise<ListedArticle[]> {
  return db
    .select({
      slug: articles.slug,
      title: articles.title,
      tagline: articles.tagline,
      publishAt: sql`${articles.publishAt}`.mapWith(articles.publishAt),
      topics: sql<
        string[]
      >`coalesce(array_agg(${topics.name}) filter (where ${topics.name} is not null), '{}')`,
    })
    .from(articles)
    .leftJoin(articleTopics, eq(articleTopics.articleId, articles.id))
    .leftJoin(topics, eq(topics.id, articleTopics.topicId))
    .where(lte(articles.publishAt, now))
    .groupBy(articles.id)
    .orderBy(desc(articles.publishAt), desc(articles.id));
}
