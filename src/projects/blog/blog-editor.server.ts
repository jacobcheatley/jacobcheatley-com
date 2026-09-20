import { desc, eq, sql } from "drizzle-orm";
import { db, dbHost, isLocalDatabase } from "@/db/index.server";
import type { ArticleSave } from "./article-schema";
import { articles, articleTopics, topics } from "./schema";

export type EditorArticle = {
  id: number;
  slug: string;
  title: string;
  tagline: string;
  publishAt: Date | null;
  topics: string[];
};

export type EditorDatabase = { host: string; isLocal: boolean };

// The editor's own read: every Article whatever its state, which no public
// function will ever return. Topics come back in no order; the index sorts them.
export function listAllArticles(): Promise<EditorArticle[]> {
  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      tagline: articles.tagline,
      publishAt: articles.publishAt,
      topics: sql<
        string[]
      >`coalesce(array_agg(${topics.name}) filter (where ${topics.name} is not null), '{}')`,
    })
    .from(articles)
    .leftJoin(articleTopics, eq(articleTopics.articleId, articles.id))
    .leftJoin(topics, eq(topics.id, articleTopics.topicId))
    .groupBy(articles.id)
    .orderBy(desc(articles.id));
}

export type CreateArticleResult =
  | { ok: true; id: number }
  | { ok: false; reason: "slugTaken" };

// A new Article is a Draft: the owner's three fields, an empty body and no
// Publish date. The unique slug decides the refusal, so no read races the write.
export async function createArticle(
  save: ArticleSave,
): Promise<CreateArticleResult> {
  const [article] = await db
    .insert(articles)
    .values({ ...save, publishAt: null })
    .onConflictDoNothing({ target: articles.slug })
    .returning({ id: articles.id });
  return article
    ? { ok: true, id: article.id }
    : { ok: false, reason: "slugTaken" };
}

// What the editor's Local / Production label is made of. The host is server
// only, so it travels to the browser through the index's loader.
export const editorDatabase = (): EditorDatabase => ({
  host: dbHost,
  isLocal: isLocalDatabase(dbHost),
});
