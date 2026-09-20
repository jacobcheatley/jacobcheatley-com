import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db/index.server";
import { articles, articleTopics, topicNames, topics } from "./schema";

export type ListedArticle = {
  slug: string;
  title: string;
  tagline: string;
  publishAt: Date;
  topics: string[];
};

export type Article = ListedArticle & { body: string };

// A Draft's null date fails the visibility rule's comparison, which is why
// publishAt is a Date in the result. Topics come back in no order; the reader
// sorts them.
const publishedColumns = {
  slug: articles.slug,
  title: articles.title,
  tagline: articles.tagline,
  publishAt: sql`${articles.publishAt}`.mapWith(articles.publishAt),
  topics: topicNames,
};

// The visibility rule: only a Publish date that has arrived (<= now, inclusive).
export function listPublishedArticles(now: Date): Promise<ListedArticle[]> {
  return db
    .select(publishedColumns)
    .from(articles)
    .leftJoin(articleTopics, eq(articleTopics.articleId, articles.id))
    .leftJoin(topics, eq(topics.id, articleTopics.topicId))
    .where(lte(articles.publishAt, now))
    .groupBy(articles.id)
    .orderBy(desc(articles.publishAt), desc(articles.id));
}

// The same rule, so a Draft's or Scheduled Article's body never leaves the
// server and an unknown slug is the one the reader cannot tell apart.
export async function findPublishedArticle(
  slug: string,
  now: Date,
): Promise<Article | undefined> {
  const [article] = await db
    .select({ ...publishedColumns, body: articles.body })
    .from(articles)
    .leftJoin(articleTopics, eq(articleTopics.articleId, articles.id))
    .leftJoin(topics, eq(topics.id, articleTopics.topicId))
    .where(and(eq(articles.slug, slug), lte(articles.publishAt, now)))
    .groupBy(articles.id);
  return article;
}
