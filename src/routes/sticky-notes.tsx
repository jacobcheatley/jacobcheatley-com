import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { StickyNotes } from "@/projects/sticky-notes/StickyNotes";
import { listNotesFn } from "@/projects/sticky-notes/sticky-notes.fn";

// This layout owns the loader and the page, so both `/sticky-notes` (mat down)
// and `/sticky-notes/new` (mat up) are the same rendered wall with the cutting
// mat slid over it or away. The child routes only name the two URLs.
export const Route = createFileRoute("/sticky-notes")({
  loader: () => listNotesFn(),
  component: StickyNotesRoute,
});

function StickyNotesRoute() {
  const notes = Route.useLoaderData();
  // A miss returns undefined rather than throwing (`shouldThrow: false`), which
  // is the "wall" case.
  const matUp =
    useMatch({ from: "/sticky-notes/new", shouldThrow: false }) !== undefined;

  return (
    <>
      <StickyNotes notes={notes} matUp={matUp} />
      <Outlet />
    </>
  );
}
