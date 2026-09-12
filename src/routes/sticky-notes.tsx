import { createFileRoute } from "@tanstack/react-router";
import { StickyWall } from "@/projects/sticky-notes/StickyWall";
import { listNotesFn } from "@/projects/sticky-notes/sticky-notes.fn";

// Top-level (not under _shell): the corkboard is full-bleed, not the centred
// Portfolio column. Read path mirrors the retired guestbook — loader + list fn.
export const Route = createFileRoute("/sticky-notes")({
  loader: () => listNotesFn(),
  component: Wall,
});

function Wall() {
  const notes = Route.useLoaderData();
  return <StickyWall notes={notes} />;
}
