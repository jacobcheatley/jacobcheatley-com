import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/blog/write/$id")({
  component: WritingRoom,
});

function WritingRoom() {
  return (
    <main className="mx-auto w-full max-w-[58rem] px-4 py-10 font-sans text-[0.875rem]">
      <Link to="/blog/write" className="text-muted">
        ← Articles
      </Link>
      <p className="mt-6">
        Article {Route.useParams().id} has no writing room yet.
      </p>
    </main>
  );
}
