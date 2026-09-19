import { useState } from "react";
import type { NoteContent } from "./note-schema";
import { StickyMat } from "./StickyMat";
import { StickyWall, type WallNote } from "./StickyWall";

// The route only says whether the mat is up; pinning a note up takes the mat
// down again without leaving that URL, so the note being pinned lives here,
// where both the wall and the mat can see it.
export function StickyNotes({
  notes,
  matUp,
}: {
  notes: WallNote[];
  matUp: boolean;
}) {
  const [pinning, setPinning] = useState<NoteContent>();
  // Setting state while rendering is React's way to follow a prop without an
  // effect: it re-renders at once, so no frame shows a note still being pinned
  // up after the editor's URL has been left.
  if (!matUp && pinning) setPinning(undefined);
  const up = matUp && !pinning;

  return (
    <>
      {/* the mat does not replace the wall: while it is up, and while the
          Spotlight hangs over it for the pinning, the wall underneath must be
          neither tabbable nor clickable */}
      <div inert={matUp}>
        <StickyWall notes={notes} pinning={pinning} />
      </div>
      <StickyMat up={up} pinning={pinning} onPinning={setPinning} />
    </>
  );
}
