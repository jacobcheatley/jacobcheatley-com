import type { Article } from "./blog.server";

// The Article route's meta tags, so a shared link unfurls as the Article.
export function articleHead({
  title,
  tagline,
}: Pick<Article, "title" | "tagline">) {
  return [
    { title },
    { name: "description", content: tagline },
    { property: "og:title", content: title },
    { property: "og:description", content: tagline },
  ];
}
