import { createFileRoute } from "@tanstack/react-router";
import { StickyWall } from "@/projects/sticky-notes/StickyWall";
import { listNotesFn } from "@/projects/sticky-notes/sticky-notes.fn";

// The wall index (`/sticky-notes`). Full-bleed, not the centred Portfolio
// column. Read path mirrors the retired guestbook — loader + list fn. The
// `/sticky-notes/new` editor is its sibling under the passthrough layout route.
export const Route = createFileRoute("/sticky-notes/")({
  loader: () => listNotesFn(),
  component: Wall,
});

function Wall() {
  const notes = Route.useLoaderData();
  return <StickyWall notes={notes} />;
}
