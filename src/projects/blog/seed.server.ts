import { sql } from "drizzle-orm";
import { db, dbHost, isLocalDatabase } from "@/db/index.server";
import { kitchenSinkMarkdown } from "./kitchen-sink";
import { articles, articleTopics, topics } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

type SeedArticle = typeof articles.$inferInsert & { topics: string[] };

// One of each state, so the local Blog shows both what a reader gets and what
// stays hidden. Their dates hang off the clock, so the states hold whenever it
// is run.
function seedArticles(nowMs: number): SeedArticle[] {
  return [
    {
      slug: "kitchen-sink",
      title: "Everything an Article can hold",
      tagline: "Code, a diagram, a callout, a table and a footnote, in one.",
      body: kitchenSinkMarkdown,
      publishAt: new Date(nowMs - 6 * DAY_MS),
      topics: ["Markdown", "TypeScript"],
    },
    {
      slug: "a-draft",
      title: "A Draft, still being written",
      tagline: "No Publish date, so the site never shows it.",
      body: "Half a paragraph, and then nothing.\n",
      publishAt: null,
      topics: ["Writing"],
    },
    {
      slug: "a-scheduled-article",
      title: "A Scheduled Article",
      tagline: "Its Publish date has not arrived, so the site waits.",
      body: "Ready to go, on the day.\n",
      publishAt: new Date(nowMs + 3 * DAY_MS),
      topics: ["Writing"],
    },
  ];
}

export async function seedBlog() {
  if (!isLocalDatabase(dbHost)) {
    throw new Error(
      `db:seed writes test Articles and ${dbHost} is not a Local database`,
    );
  }
  for (const article of seedArticles(Date.now())) await upsertArticle(article);
}

async function upsertArticle({ topics: topicNames, ...values }: SeedArticle) {
  const [article] = await db
    .insert(articles)
    .values(values)
    .onConflictDoUpdate({ target: articles.slug, set: values })
    .returning({ id: articles.id });
  if (!article) throw new Error(`upsert of ${values.slug} returned no row`);

  for (const name of topicNames) {
    await db
      .insert(articleTopics)
      .values({ articleId: article.id, topicId: await upsertTopic(name) })
      .onConflictDoNothing();
  }
}

async function upsertTopic(name: string) {
  // Bare `do nothing`: the Topic's uniqueness is an index over lower(name),
  // which is not a conflict target drizzle can name.
  await db.insert(topics).values({ name }).onConflictDoNothing();
  const [topic] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(sql`lower(${topics.name}) = lower(${name})`);
  if (!topic) throw new Error(`upsert of Topic ${name} returned no row`);
  return topic.id;
}
