import { Link } from "@tanstack/react-router";
import { ArticleMeta } from "./ArticleMeta";
import type { ListedArticle } from "./blog.server";

export function ArticleList({ articles }: { articles: ListedArticle[] }) {
  return (
    <ul className="grid gap-9">
      {articles.map((article) => (
        <li key={article.slug}>
          <h2 className="mb-[0.2rem] text-[1.5rem] font-medium leading-[1.2]">
            <Link
              to="/blog/$slug"
              params={{ slug: article.slug }}
              className="no-underline hover:text-accent hover:underline"
            >
              {article.title}
            </Link>
          </h2>
          <p>{article.tagline}</p>
          <ArticleMeta publishAt={article.publishAt} topics={article.topics} />
        </li>
      ))}
    </ul>
  );
}
