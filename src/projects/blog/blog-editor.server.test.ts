import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import { createArticle, listAllArticles } from "./blog-editor.server";
import { articles, articleTopics, topics } from "./schema";

const save = {
  title: "Type-safe SQL",
  slug: "type-safe-sql",
  tagline: "Where the types stop and the database begins.",
  body: "",
};

describe("createArticle", () => {
  it("inserts a Draft: the owner's fields, an empty body and no Publish date", async () => {
    const created = await createArticle(save);
    if (!created.ok) throw new Error("create was refused");

    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, created.id));
    expect(article).toMatchObject({ ...save, publishAt: null });
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
