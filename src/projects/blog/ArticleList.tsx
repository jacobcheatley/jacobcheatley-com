import type { ListedArticle } from "./blog.server";
import { formatPublishDate } from "./publish-date";

export function ArticleList({ articles }: { articles: ListedArticle[] }) {
  return (
    <ul className="grid gap-9">
      {articles.map((article) => (
        <li key={article.slug}>
          <h2 className="mb-[0.2rem] text-[1.5rem] font-medium leading-[1.2]">
            <a
              href={`/blog/${article.slug}`}
              className="no-underline hover:text-accent hover:underline"
            >
              {article.title}
            </a>
          </h2>
          <p>{article.tagline}</p>
          <p className="mt-[0.35rem] font-sans text-[0.875rem] text-muted">
            {formatPublishDate(article.publishAt)}
            {article.topics.length > 0 &&
              ` · ${[...article.topics].sort((a, b) => a.localeCompare(b)).join(", ")}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
