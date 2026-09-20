import { desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { db, dbHost, isLocalDatabase } from "@/db/index.server";
import type { ArticleDraft, ArticleSave } from "./article-schema";
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

// Every Topic on the Blog, for the writing room's toggles, alphabetical
// whatever case each is written in.
export async function listTopics(): Promise<string[]> {
  const rows = await db
    .select({ name: topics.name })
    .from(topics)
    .orderBy(sql`lower(${topics.name})`);
  return rows.map((row) => row.name);
}

// What a save and a delete hand their Topic work to: both do it in the one
// transaction as the write itself.
type BlogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// An Article's Topic links, replaced. A name the Blog already holds is linked
// to that row whatever case it was written in, so the existing spelling wins;
// the names the links landed on come back.
export async function linkTopics(
  tx: BlogTransaction,
  articleId: number,
  names: string[],
): Promise<string[]> {
  await tx.delete(articleTopics).where(eq(articleTopics.articleId, articleId));
  if (names.length === 0) return [];
  // Bare `do nothing`: the Topic's uniqueness is an index over lower(name),
  // which is not a conflict target drizzle can name.
  await tx
    .insert(topics)
    .values(names.map((name) => ({ name })))
    .onConflictDoNothing();
  const linked = await tx
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(
      inArray(
        sql`lower(${topics.name})`,
        names.map((name) => name.toLowerCase()),
      ),
    );
  await tx
    .insert(articleTopics)
    .values(linked.map((topic) => ({ articleId, topicId: topic.id })));
  return linked.map((topic) => topic.name);
}

// A Topic exists for the Articles that hold it: the last link away from one
// takes it off the Blog.
const deleteOrphanTopics = (tx: BlogTransaction) =>
  tx
    .delete(topics)
    .where(
      notExists(
        tx
          .select()
          .from(articleTopics)
          .where(eq(articleTopics.topicId, topics.id)),
      ),
    );

export type CreateArticleResult =
  | { ok: true; id: number }
  | { ok: false; reason: "slugTaken" };

// A new Article is whatever the create form parsed: the owner's three fields,
// an empty body and no Publish date. The unique slug decides the refusal, so
// no read races the write.
export async function createArticle(
  draft: ArticleDraft,
): Promise<CreateArticleResult> {
  const [article] = await db
    .insert(articles)
    .values(draft)
    .onConflictDoNothing({ target: articles.slug })
    .returning({ id: articles.id });
  return article
    ? { ok: true, id: article.id }
    : { ok: false, reason: "slugTaken" };
}

// A save settles how each of its Topics is spelled and can take a Topic off
// the Blog, so it answers with the Article's Topics and with every Topic left.
export type SaveArticleResult =
  | { ok: true; topics: string[]; allTopics: string[] }
  | { ok: false; reason: "slugTaken" | "articleGone" };

// What the transaction settles, before the Blog's remaining Topics are read.
type Saved =
  | { ok: true; topics: string[] }
  | Extract<SaveArticleResult, { ok: false }>;

// Every field of the Article at once, last write wins. The slug another
// Article holds is read in the same transaction as the write, so the refusal
// and the row cannot disagree; the Article's own slug is not taken.
export async function saveArticle(
  id: number,
  { topics: topicNames, ...columns }: ArticleSave,
): Promise<SaveArticleResult> {
  const saved = await db.transaction(async (tx): Promise<Saved> => {
    const [holder] = await tx
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, columns.slug));
    if (holder && holder.id !== id) return { ok: false, reason: "slugTaken" };

    const [written] = await tx
      .update(articles)
      .set(columns)
      .where(eq(articles.id, id))
      .returning({ id: articles.id });
    if (!written) return { ok: false, reason: "articleGone" };

    const linked = await linkTopics(tx, id, topicNames);
    await deleteOrphanTopics(tx);
    return { ok: true, topics: linked };
  });
  // Every Topic left on the Blog is read once the cleanup has committed.
  return saved.ok ? { ...saved, allTopics: await listTopics() } : saved;
}

// A hard delete, whatever state the Article is in. Its Topic links go with it
// by cascade, and a Topic it was the last to hold goes with them.
export async function deleteArticle(id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(articles).where(eq(articles.id, id));
    await deleteOrphanTopics(tx);
  });
}

// What the editor's Local / Production label is made of. The host is server
// only, so it travels to the browser through the index's loader.
export const editorDatabase = (): EditorDatabase => ({
  host: dbHost,
  isLocal: isLocalDatabase(dbHost),
});
