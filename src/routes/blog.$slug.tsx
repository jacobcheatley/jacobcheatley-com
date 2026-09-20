import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArticleView } from "@/projects/blog/ArticleView";
import { articleHead } from "@/projects/blog/article-head";
import { BlogHomeLink, BlogLayout } from "@/projects/blog/BlogLayout";
import { findPublishedArticleFn } from "@/projects/blog/blog.fn";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const article = await findPublishedArticleFn({ data: params.slug });
    // A Draft, a Scheduled Article and a slug nobody has written are one case.
    if (!article) throw notFound();
    return article;
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? articleHead(loaderData) : [],
  }),
  component: ArticleRoute,
  notFoundComponent: NoArticle,
});

function ArticleRoute() {
  return <ArticleView article={Route.useLoaderData()} />;
}

function NoArticle() {
  return (
    <BlogLayout heading={<BlogHomeLink />}>
      <h1 className="text-[2rem] font-medium italic">No Article here.</h1>
      <p className="mt-2">
        <Link
          to="/blog"
          activeOptions={{ exact: true }}
          className="text-accent"
        >
          All Articles
        </Link>
      </p>
    </BlogLayout>
  );
}
