import { createFileRoute } from "@tanstack/react-router";
import { ArticleIndex } from "@/projects/blog/ArticleIndex";
import { createArticleFn, editorIndexFn } from "@/projects/blog/blog-editor.fn";

export const Route = createFileRoute("/blog/write/")({
  loader: () => editorIndexFn(),
  component: ArticleIndexRoute,
});

function ArticleIndexRoute() {
  return (
    <ArticleIndex {...Route.useLoaderData()} createArticle={createArticleFn} />
  );
}
