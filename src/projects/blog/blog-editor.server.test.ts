import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import { listPublishedArticles } from "./blog.server";
import {
  createArticle,
  deleteArticle,
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

// What the writing room sends: the create form's fields and the Topics only it
// can put on an Article.
const roomSave = { ...save, topics: [] };

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

const topicNames = async () => {
  const rows = await db.select({ name: topics.name }).from(topics);
  return rows.map((row) => row.name);
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
        ...roomSave,
        title: "Type-safe SQL, revisited",
        body: "# Again\n",
      }),
    ).toMatchObject({ ok: true });
    expect(await storedArticle(id)).toMatchObject({
      title: "Type-safe SQL, revisited",
      body: "# Again\n",
      slug: save.slug,
    });
  });

  it("does not hold an Article's own slug against it", async () => {
    await createdArticle({ slug: "another-article" });
    const id = await createdArticle();

    expect(
      await saveArticle(id, { ...roomSave, title: "Its own slug" }),
    ).toMatchObject({ ok: true });
  });

  it("refuses a slug another Article already has, and writes nothing", async () => {
    const taken = await createdArticle({ slug: "taken" });
    const id = await createdArticle();

    expect(await saveArticle(id, { ...roomSave, slug: "taken" })).toEqual({
      ok: false,
      reason: "slugTaken",
    });
    expect(await storedArticle(id)).toMatchObject({ slug: save.slug });
    expect(await storedArticle(taken)).toMatchObject({ title: save.title });
  });

  it("reports an Article that is no longer in the database", async () => {
    expect(await saveArticle(404, roomSave)).toEqual({
      ok: false,
      reason: "articleGone",
    });
  });

  it("puts the Article on the site with a Publish date and takes it off again", async () => {
    const id = await createdArticle();
    const now = new Date();

    await saveArticle(id, {
      ...roomSave,
      publishAt: new Date(now.getTime() - 1),
    });
    expect(await listPublishedArticles(now)).toMatchObject([
      { slug: save.slug },
    ]);

    await saveArticle(id, { ...roomSave, publishAt: null });
    expect(await listPublishedArticles(now)).toEqual([]);
  });

  it("links a Topic to the spelling the Blog already holds", async () => {
    const first = await createdArticle({ slug: "first" });
    await saveArticle(first, {
      ...roomSave,
      slug: "first",
      topics: ["TypeScript"],
    });
    const second = await createdArticle({ slug: "second" });

    expect(
      await saveArticle(second, {
        ...roomSave,
        slug: "second",
        topics: ["typescript"],
      }),
    ).toEqual({ ok: true, topics: ["TypeScript"], allTopics: ["TypeScript"] });
    expect(await topicNames()).toEqual(["TypeScript"]);
    expect(await db.select().from(articleTopics)).toHaveLength(2);
  });

  it("deletes a Topic the save leaves with no Article", async () => {
    const id = await createdArticle();
    await saveArticle(id, { ...roomSave, topics: ["Markdown"] });

    expect(await saveArticle(id, { ...roomSave, topics: [] })).toEqual({
      ok: true,
      topics: [],
      allTopics: [],
    });
    expect(await topicNames()).toEqual([]);
  });

  it("keeps a Topic another Article still holds", async () => {
    const kept = await createdArticle({ slug: "kept" });
    await saveArticle(kept, { ...roomSave, slug: "kept", topics: ["Writing"] });
    const dropping = await createdArticle({ slug: "dropping" });
    await saveArticle(dropping, {
      ...roomSave,
      slug: "dropping",
      topics: ["Writing"],
    });

    await saveArticle(dropping, { ...roomSave, slug: "dropping", topics: [] });

    expect(await topicNames()).toEqual(["Writing"]);
  });
});

describe("deleteArticle", () => {
  it("removes the Article and its Topic links", async () => {
    const id = await createdArticle();
    const [topic] = await db
      .insert(topics)
      .values({ name: "Postgres" })
      .returning({ id: topics.id });
    if (!topic) throw new Error("insert returned no row");
    await db.insert(articleTopics).values({ articleId: id, topicId: topic.id });

    await deleteArticle(id);

    expect(await db.select().from(articles)).toEqual([]);
    expect(await db.select().from(articleTopics)).toEqual([]);
  });

  it("deletes a Topic the Article was the last to hold", async () => {
    const id = await createdArticle();
    await saveArticle(id, { ...roomSave, topics: ["Markdown"] });

    await deleteArticle(id);

    expect(await topicNames()).toEqual([]);
  });

  it("keeps a Topic another Article still holds", async () => {
    const kept = await createdArticle({ slug: "kept" });
    await saveArticle(kept, { ...roomSave, slug: "kept", topics: ["Writing"] });
    const going = await createdArticle({ slug: "going" });
    await saveArticle(going, {
      ...roomSave,
      slug: "going",
      topics: ["Writing"],
    });

    await deleteArticle(going);

    expect(await topicNames()).toEqual(["Writing"]);
  });
});
