import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import {
  createArticle,
  findArticleForEditing,
  listAllArticles,
  saveArticle,
} from "./blog-editor.server";
import { articles, articleTopics, topics } from "./schema";

const save = {
  title: "Type-safe SQL",
  slug: "type-safe-sql",
  tagline: "Where the types stop and the database begins.",
  body: "",
  publishAt: null,
};

describe("createArticle", () => {
  it("inserts a Draft: the owner's fields, an empty body and no Publish date", async () => {
    const created = await createArticle(save);
    if (!created.ok) throw new Error("create was refused");

    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, created.id));
    expect(article).toMatchObject(save);
  });

  it("refuses a slug another Article already has, and writes nothing", async () => {
    await createArticle(save);

    expect(await createArticle({ ...save, title: "A second try" })).toEqual({
      ok: false,
      reason: "slugTaken",
    });
    expect(await db.select().from(articles)).toHaveLength(1);
  });
});

describe("listAllArticles", () => {
  it("returns an Article in every state, with its Topics", async () => {
    const draft = await createArticle(save);
    if (!draft.ok) throw new Error("create was refused");
    await db
      .insert(articles)
      .values({ ...save, slug: "published", publishAt: new Date() });
    const [topic] = await db
      .insert(topics)
      .values({ name: "Postgres" })
      .returning({ id: topics.id });
    if (!topic) throw new Error("insert returned no row");
    await db
      .insert(articleTopics)
      .values({ articleId: draft.id, topicId: topic.id });

    const listed = await listAllArticles();
    expect(listed.map((article) => article.slug).sort()).toEqual([
      "published",
      "type-safe-sql",
    ]);
    expect(listed.find((article) => article.id === draft.id)).toMatchObject({
      publishAt: null,
      topics: ["Postgres"],
    });
  });
});

const createdArticle = async (fields: Partial<typeof save> = {}) => {
  const created = await createArticle({ ...save, ...fields });
  if (!created.ok) throw new Error("create was refused");
  return created.id;
};

const storedArticle = async (id: number) => {
  const [article] = await db.select().from(articles).where(eq(articles.id, id));
  return article;
};

describe("findArticleForEditing", () => {
  it("reads a Draft the site never shows, body and all", async () => {
    const id = await createdArticle({ body: "Half a paragraph.\n" });

    expect(await findArticleForEditing(id)).toMatchObject({
      id,
      slug: save.slug,
      title: save.title,
      body: "Half a paragraph.\n",
      publishAt: null,
      topics: [],
    });
  });

  it("has no Article for an id nothing was written under", async () => {
    expect(await findArticleForEditing(404)).toBeUndefined();
  });
});

describe("saveArticle", () => {
  it("replaces the Article's title and body", async () => {
    const id = await createdArticle();

    expect(
      await saveArticle(id, {
        ...save,
        title: "Type-safe SQL, revisited",
        body: "# Again\n",
      }),
    ).toEqual({ ok: true });
    expect(await storedArticle(id)).toMatchObject({
      title: "Type-safe SQL, revisited",
      body: "# Again\n",
      slug: save.slug,
    });
  });

  it("does not hold an Article's own slug against it", async () => {
    await createdArticle({ slug: "another-article" });
    const id = await createdArticle();

    expect(await saveArticle(id, { ...save, title: "Its own slug" })).toEqual({
      ok: true,
    });
  });

  it("refuses a slug another Article already has, and writes nothing", async () => {
    const taken = await createdArticle({ slug: "taken" });
    const id = await createdArticle();

    expect(await saveArticle(id, { ...save, slug: "taken" })).toEqual({
      ok: false,
      reason: "slugTaken",
    });
    expect(await storedArticle(id)).toMatchObject({ slug: save.slug });
    expect(await storedArticle(taken)).toMatchObject({ title: save.title });
  });

  it("reports an Article that is no longer in the database", async () => {
    expect(await saveArticle(404, save)).toEqual({
      ok: false,
      reason: "articleGone",
    });
  });
});
