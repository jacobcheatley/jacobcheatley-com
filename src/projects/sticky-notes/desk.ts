import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

// The desk's shared look, kept out of both components that wear it. The mat
// surface (StickyMat) SSRs with the wall; everything that lies ON it
// (StickyEditor) is a lazy chunk, so neither may own constants the other
// imports — a static import either way would pull the editor into the wall's
// bundle. This module is the one both sides read from.

// Motion, all CSS: no animation library anywhere in this spec (#69). The
// prototype's ease-out (#70): quick off the mark, long settle.
export const EASE_OUT = "cubic-bezier(.2,.8,.25,1)";

// The mat's slide over the wall and away — and the pinned note's flight onto
// the wall (#77), which rides that same slide down.
export const SLIDE_MS = 500;

// A box on screen as the flight reads it: a DOMRect is one, and so is a plain
// object in a test.
type Box = { left: number; top: number; width: number; height: number };

// The pinned note's flight onto the wall (#77), as numbers: the translate and
// scale that put its wall tile back over the sheet it lay as on the mat, for
// the flight to let go of. The scale is about the tile's centre (CSS's default
// origin). A wall tile is taller than its paper by the fastener's headroom,
// all of it above the sheet, so the sheet's centre sits half that headroom
// below the tile's — and that offset grows with the scale.
// ponytail: centres off the rotated bounding boxes, which is out by a pixel
// or two at the steepest tilt; unrotate the boxes if the landing ever shows
// a nudge.
export function flightTransform(
  from: Box,
  to: Box,
): { dx: number; dy: number; scale: number } {
  const scale = from.width / to.width;
  const headroom = to.height - to.width;
  return {
    dx: from.left + from.width / 2 - (to.left + to.width / 2),
    dy:
      from.top +
      from.height / 2 -
      (to.top + to.height / 2) -
      (scale * headroom) / 2,
    scale,
  };
}

// The sticker sheet's ride up from behind the tray (#75, #82), and the note's
// move out of its way, which keeps time with it.
export const SHEET_MS = 500;

// Keep a gesture with the pointer that started it, wherever that pointer
// wanders. The guard is for jsdom (no pointer capture at all) and for a
// pointer id that is no longer live, which throws rather than returning.
export function capturePointer(e: ReactPointerEvent): void {
  try {
    e.currentTarget.setPointerCapture?.(e.pointerId);
  } catch {
    // not a live pointer — carry on without capture
  }
}

// Cool slate cutting mat (spec #49): grid rules over a dark wash, distinct from
// the wall's warm cork.
export const DESK_BG: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "radial-gradient(120% 120% at 50% 0%, #2a2f36, #171a1f)",
  ].join(", "),
  backgroundSize: "26px 26px, 26px 26px, cover",
};

// A strip of masking tape stuck to the mat — the label style for the mat's own
// controls (the pinning phase adds its own in T7).
export const TAPE: CSSProperties = {
  backgroundColor: "#e8dcae",
  backgroundImage: [
    "linear-gradient(180deg, rgba(255,255,255,.45), rgba(0,0,0,.06))",
    "repeating-linear-gradient(90deg, rgba(160,140,90,.10) 0 3px, transparent 3px 7px)",
  ].join(", "),
  boxShadow: "0 2px 5px rgba(0,0,0,.4)",
  clipPath: "polygon(3% 0, 97% 2%, 100% 96%, 96% 100%, 4% 98%, 0 4%)",
  transform: "rotate(-2.2deg)",
};

// Tailwind's `!`: the desk's transitions are inline (their timings are JS
// constants), and only an important rule can switch them off for
// prefers-reduced-motion.
export const STILL = "motion-reduce:transition-none!";
