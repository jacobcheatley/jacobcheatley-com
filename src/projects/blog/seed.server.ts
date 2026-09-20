import { db, dbHost, isLocalDatabase } from "@/db/index.server";
import { linkTopics } from "./blog-editor.server";
import { kitchenSinkMarkdown } from "./kitchen-sink";
import { articles } from "./schema";

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
  await db.transaction((tx) => linkTopics(tx, article.id, topicNames));
}
