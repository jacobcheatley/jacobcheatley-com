import { createFileRoute } from "@tanstack/react-router";
import { ArticleList } from "@/projects/blog/ArticleList";
import { listPublishedArticlesFn } from "@/projects/blog/blog.fn";

export const Route = createFileRoute("/blog/")({
  loader: () => listPublishedArticlesFn(),
  component: ArticleListRoute,
});

function ArticleListRoute() {
  return <ArticleList articles={Route.useLoaderData()} />;
}
