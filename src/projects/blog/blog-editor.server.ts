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

// The whole Article the writing room opens: the index's row and the body.
export type EditingArticle = EditorArticle & { body: string };

export type EditorDatabase = { host: string; isLocal: boolean };

// Topics come back in no order; the index and the preview sort them.
const editorColumns = {
  id: articles.id,
  slug: articles.slug,
  title: articles.title,
  tagline: articles.tagline,
  publishAt: articles.publishAt,
  topics: sql<
    string[]
  >`coalesce(array_agg(${topics.name}) filter (where ${topics.name} is not null), '{}')`,
};

// The editor's own read: every Article whatever its state, which no public
// function will ever return.
export function listAllArticles(): Promise<EditorArticle[]> {
  return db
    .select(editorColumns)
    .from(articles)
    .leftJoin(articleTopics, eq(articleTopics.articleId, articles.id))
    .leftJoin(topics, eq(topics.id, articleTopics.topicId))
    .groupBy(articles.id)
    .orderBy(desc(articles.id));
}

// The editor reads an Article by id, because the slug is the owner's to edit.
export async function findArticleForEditing(
  id: number,
): Promise<EditingArticle | undefined> {
  const [article] = await db
    .select({ ...editorColumns, body: articles.body })
    .from(articles)
    .leftJoin(articleTopics, eq(articleTopics.articleId, articles.id))
    .leftJoin(topics, eq(topics.id, articleTopics.topicId))
    .where(eq(articles.id, id))
    .groupBy(articles.id);
  return article;
}

export type CreateArticleResult =
  | { ok: true; id: number }
  | { ok: false; reason: "slugTaken" };

// A new Article is whatever the create form parsed: the owner's three fields,
// an empty body and no Publish date. The unique slug decides the refusal, so
// no read races the write.
export async function createArticle(
  save: ArticleSave,
): Promise<CreateArticleResult> {
  const [article] = await db
    .insert(articles)
    .values(save)
    .onConflictDoNothing({ target: articles.slug })
    .returning({ id: articles.id });
  return article
    ? { ok: true, id: article.id }
    : { ok: false, reason: "slugTaken" };
}

export type SaveArticleResult =
  | { ok: true }
  | { ok: false; reason: "slugTaken" | "articleGone" };

// Every field of the Article at once, last write wins. The slug another
// Article holds is read in the same transaction as the write, so the refusal
// and the row cannot disagree; the Article's own slug is not taken.
export function saveArticle(
  id: number,
  save: ArticleSave,
): Promise<SaveArticleResult> {
  return db.transaction(async (tx): Promise<SaveArticleResult> => {
    const [holder] = await tx
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, save.slug));
    if (holder && holder.id !== id) return { ok: false, reason: "slugTaken" };

    const [saved] = await tx
      .update(articles)
      .set(save)
      .where(eq(articles.id, id))
      .returning({ id: articles.id });
    return saved ? { ok: true } : { ok: false, reason: "articleGone" };
  });
}

// What the editor's Local / Production label is made of. The host is server
// only, so it travels to the browser through the index's loader.
export const editorDatabase = (): EditorDatabase => ({
  host: dbHost,
  isLocal: isLocalDatabase(dbHost),
});
