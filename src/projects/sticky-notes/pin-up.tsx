import type { ReactNode } from "react";
import { EASE_OUT, SLIDE_MS, TAPE } from "./desk";
import { FONT_FAMILIES } from "./note-fonts";

// Pinning a note up (#77): what happens between the mat and the wall. The
// editor keeps the note and decides when; this file is the pieces it wears —
// the tape labels and the note's flight onto the wall.

// A strip of masking tape with a word on it, in the casual hand: the desk's own
// buttons ("pin it up", "back to the desk"), stuck on rather than printed.
export function TapeLabel({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-0 px-4 py-1.5 text-[1.1875rem] leading-snug ${className}`}
      style={{ ...TAPE, color: "#4a412c", fontFamily: FONT_FAMILIES.casual }}
    >
      {children}
    </button>
  );
}

// The note's flight from the mat into its slot on the wall: a FLIP. The wall
// has already laid the landed note out where it belongs (Last); it is put back
// over where the sheet lay on the mat (First, measured before the wall
// changed) by an inverse transform (Invert), which is then let go under a
// transition (Play). No animation library (#69).
export function flyToLanding(from: DOMRect | undefined): void {
  // The newest slot is at the top of the wall, so that is where to look.
  window.scrollTo(0, 0);
  const tile = document.querySelector<HTMLElement>("[data-landing]");
  const to = tile?.getBoundingClientRect();
  if (!tile || !from || !to?.width) return; // nothing laid out (jsdom)
  const scale = from.width / to.width;
  // A wall tile is taller than its paper by the fastener's headroom, all of it
  // above the sheet, so the sheet's centre sits half that headroom below the
  // tile's — and that offset grows with the scale.
  // ponytail: centres off the rotated bounding boxes, which is out by a pixel
  // or two at the steepest tilt; unrotate the boxes if the landing ever shows
  // a nudge.
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy =
    from.top +
    from.height / 2 -
    (to.top + to.height / 2) -
    (scale * (to.height - to.width)) / 2;
  tile.style.transition = "none";
  tile.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  // Reading layout here makes the browser take the start position before the
  // end one, or the two collapse into no motion at all.
  tile.getBoundingClientRect();
  tile.style.transition = `transform ${SLIDE_MS}ms ${EASE_OUT}`;
  tile.style.transform = "";
}
