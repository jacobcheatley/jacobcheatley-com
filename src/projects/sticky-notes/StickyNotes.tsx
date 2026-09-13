import { useState } from "react";
import type { NoteContent } from "./note-schema";
import { StickyMat } from "./StickyMat";
import { StickyWall, type WallNote } from "./StickyWall";

// Sticky Notes is one page (#69): the cork wall, with the cutting mat slid up
// over it or away. The route says which — `matUp` is "the URL is
// /sticky-notes/new" — and pinning a note up (#77) takes the mat down again
// without leaving that URL, so the page holds the one thing both halves need to
// see: the note that has landed on the wall.
export function StickyNotes({
  notes,
  matUp,
}: {
  notes: WallNote[];
  matUp: boolean;
}) {
  const [landing, setLanding] = useState<NoteContent | null>(null);
  // Leaving the editor's URL — Back, or the submit's own navigation — ends the
  // pinning phase; the draft is still on the mat, which stays mounted. Setting
  // state while rendering is React's way to follow a prop without an effect: it
  // re-renders at once, so no frame shows a stale landed note.
  if (!matUp && landing) setLanding(null);
  const up = matUp && !landing;

  return (
    <>
      {/* the mat covers the wall but does not replace it: while it is up the
          wall underneath must be neither tabbable nor clickable */}
      <div inert={up}>
        <StickyWall notes={notes} landing={landing ?? undefined} />
      </div>
      <StickyMat up={up} landing={landing} onLanding={setLanding} />
    </>
  );
}
