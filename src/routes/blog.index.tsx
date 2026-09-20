import { createFileRoute } from "@tanstack/react-router";
import { ArticleList } from "@/projects/blog/ArticleList";
import { BlogHeading, BlogLayout } from "@/projects/blog/BlogLayout";
import { listPublishedArticlesFn } from "@/projects/blog/blog.fn";

export const Route = createFileRoute("/blog/")({
  loader: () => listPublishedArticlesFn(),
  component: ArticleListRoute,
});

function ArticleListRoute() {
  return (
    <BlogLayout heading={<BlogHeading />}>
      <ArticleList articles={Route.useLoaderData()} />
    </BlogLayout>
  );
}
