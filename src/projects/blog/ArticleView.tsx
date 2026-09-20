import { Link } from "@tanstack/react-router";
import { ArticleBody } from "./ArticleBody";
import { ArticleMeta } from "./ArticleMeta";
import { BlogHomeLink, BlogLayout } from "./BlogLayout";
import type { Article } from "./blog.server";

// What the view reads: an Article, except that the editor's preview feeds it
// unsaved writing, and a Draft has no Publish date yet.
export type ArticleInView = Omit<Article, "publishAt"> & {
  publishAt: Date | null;
};

// The whole Article as a reader gets it, from an Article value alone: the
// route hands it the loaded row, the editor preview the unsaved form state.
export function ArticleView({ article }: { article: ArticleInView }) {
  return (
    <BlogLayout heading={<BlogHomeLink />}>
      <article>
        <header className="mb-10">
          <h1 className="text-[clamp(2rem,5vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.01em]">
            {article.title}
          </h1>
          <p className="mt-2 text-[1.3125rem] italic text-muted">
            {article.tagline}
          </p>
          <ArticleMeta publishAt={article.publishAt} topics={article.topics} />
        </header>
        <ArticleBody markdown={article.body} />
      </article>
      <footer className="mt-16 border-t border-line pt-6 font-sans text-[0.9375rem] text-muted">
        <Link
          to="/blog"
          activeOptions={{ exact: true }}
          className="no-underline hover:text-accent hover:underline"
        >
          ← All Articles
        </Link>
      </footer>
    </BlogLayout>
  );
}
