import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  deleteArticleFn,
  saveArticleFn,
  writingRoomFn,
} from "@/projects/blog/blog-editor.fn";
import { WritingRoom } from "@/projects/blog/WritingRoom";

export const Route = createFileRoute("/blog/write/$id")({
  loader: async ({ params }) => {
    // The room is keyed on the Article's id, because the slug is editable.
    const id = Number(params.id);
    if (!Number.isInteger(id)) throw notFound();
    const room = await writingRoomFn({ data: id });
    if (!room.article) throw notFound();
    return { article: room.article, database: room.database };
  },
  component: WritingRoomRoute,
});

function WritingRoomRoute() {
  return (
    <WritingRoom
      {...Route.useLoaderData()}
      now={() => new Date()}
      saveArticle={saveArticleFn}
      deleteArticle={deleteArticleFn}
    />
  );
}
