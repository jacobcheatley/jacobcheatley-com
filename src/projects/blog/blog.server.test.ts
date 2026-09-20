import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import { findPublishedArticle, listPublishedArticles } from "./blog.server";
import { articles, articleTopics, topics } from "./schema";

const now = new Date("2026-09-20T12:00:00.000Z");

async function insertArticle(
  slug: string,
  publishAt: Date | null,
  topicNames: string[] = [],
) {
  const [article] = await db
    .insert(articles)
    .values({
      slug,
      title: `The ${slug} Article`,
      tagline: `Tagline of ${slug}`,
      body: "Body.",
      publishAt,
    })
    .returning({ id: articles.id });
  if (!article) throw new Error("insert returned no row");

  for (const name of topicNames) {
    const [topic] = await db
      .insert(topics)
      .values({ name })
      .returning({ id: topics.id });
    if (!topic) throw new Error("insert returned no row");
    await db
      .insert(articleTopics)
      .values({ articleId: article.id, topicId: topic.id });
  }
}

describe("listPublishedArticles", () => {
  it("lists an Article once its Publish date has arrived, and not a millisecond before", async () => {
    await insertArticle("draft", null);
    await insertArticle("scheduled", new Date(now.getTime() + 1));
    await insertArticle("on-the-dot", now);
    await insertArticle("past", new Date("2026-09-01T00:00:00.000Z"));

    const listed = await listPublishedArticles(now);

    expect(listed.map((article) => article.slug)).toEqual([
      "on-the-dot",
      "past",
    ]);
  });

  it("lists Published Articles newest first", async () => {
    await insertArticle("middle", new Date("2026-05-01T00:00:00.000Z"));
    await insertArticle("oldest", new Date("2024-01-01T00:00:00.000Z"));
    await insertArticle("newest", new Date("2026-09-19T00:00:00.000Z"));

    const listed = await listPublishedArticles(now);

    expect(listed.map((article) => article.slug)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("carries each Article's Topics", async () => {
    await insertArticle("tagged", now, ["Postgres", "TypeScript"]);
    await insertArticle("bare", new Date("2026-01-01T00:00:00.000Z"));

    const [tagged, bare] = await listPublishedArticles(now);

    expect([...(tagged?.topics ?? [])].sort()).toEqual([
      "Postgres",
      "TypeScript",
    ]);
    expect(bare?.topics).toEqual([]);
  });

  it("returns the Article's title, Tagline and Publish date", async () => {
    await insertArticle("one-article", now);

    const [listed] = await listPublishedArticles(now);

    expect(listed).toEqual({
      slug: "one-article",
      title: "The one-article Article",
      tagline: "Tagline of one-article",
      publishAt: now,
      topics: [],
    });
  });
});

describe("findPublishedArticle", () => {
  it("finds an Article once its Publish date has arrived, and not a millisecond before", async () => {
    await insertArticle("draft", null);
    await insertArticle("scheduled", new Date(now.getTime() + 1));
    await insertArticle("on-the-dot", now);
    await insertArticle("past", new Date("2026-09-01T00:00:00.000Z"));

    const found = await Promise.all(
      ["draft", "scheduled", "on-the-dot", "past"].map((slug) =>
        findPublishedArticle(slug, now),
      ),
    );

    expect(found.map((article) => article?.slug)).toEqual([
      undefined,
      undefined,
      "on-the-dot",
      "past",
    ]);
  });

  it("finds nothing at a slug no Article has", async () => {
    await insertArticle("one-article", now);

    expect(await findPublishedArticle("never-written", now)).toBeUndefined();
  });

  it("returns the Article's body, title, Tagline, Publish date and Topics", async () => {
    await insertArticle("one-article", now, ["Postgres"]);

    expect(await findPublishedArticle("one-article", now)).toEqual({
      slug: "one-article",
      title: "The one-article Article",
      tagline: "Tagline of one-article",
      body: "Body.",
      publishAt: now,
      topics: ["Postgres"],
    });
  });
});
