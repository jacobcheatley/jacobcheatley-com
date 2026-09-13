import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { StickyMat } from "@/projects/sticky-notes/StickyMat";
import { StickyWall } from "@/projects/sticky-notes/StickyWall";
import { listNotesFn } from "@/projects/sticky-notes/sticky-notes.fn";

// Sticky Notes is one page (#69). This layout owns it: the loader and the wall
// live here, so both `/sticky-notes` (mat down) and `/sticky-notes/new` (mat up)
// are the same rendered wall with the cutting mat slid over it or away. The two
// child routes render nothing of their own — they only name the two URLs.
export const Route = createFileRoute("/sticky-notes")({
  loader: () => listNotesFn(),
  component: StickyNotes,
});

function StickyNotes() {
  const notes = Route.useLoaderData();
  // The route IS the mat state: matching the editor's URL means the mat is up.
  // A miss returns undefined rather than throwing, which is the "wall" case.
  const matUp =
    useMatch({ from: "/sticky-notes/new", shouldThrow: false }) !== undefined;

  return (
    <>
      {/* the mat covers the wall but does not replace it: while it is up the
          wall underneath must be neither tabbable nor clickable */}
      <div inert={matUp}>
        <StickyWall notes={notes} />
      </div>
      <StickyMat up={matUp} />
      <Outlet />
    </>
  );
}
