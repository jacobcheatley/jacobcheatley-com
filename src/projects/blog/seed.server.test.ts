import { expect, it } from "vitest";
import { db } from "@/db/index.server";
import { listPublishedArticles } from "./blog.server";
import { articles } from "./schema";
import { seedBlog } from "./seed.server";

it("keys on the slug, so a second run leaves the same three Articles with only the kitchen sink Published", async () => {
  await seedBlog();
  await seedBlog();

  expect(await db.select().from(articles)).toHaveLength(3);

  const published = await listPublishedArticles(new Date());
  expect(published.map((article) => article.slug)).toEqual(["kitchen-sink"]);
});
