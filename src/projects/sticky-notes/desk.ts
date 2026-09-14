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

// How far one box's centre is from another's, in px: where a torn-off sheet
// starts (its pad, seen from where it lands), where a crumpled one goes (the
// bin, seen from the sheet), and the move in the pinned note's flight. A box
// that isn't there to measure is no move at all.
export type Offset = { dx: number; dy: number };

export function centreOffset(
  from: Box | undefined,
  to: Box | undefined,
): Offset {
  if (!from || !to) return { dx: 0, dy: 0 };
  return {
    dx: from.left + from.width / 2 - (to.left + to.width / 2),
    dy: from.top + from.height / 2 - (to.top + to.height / 2),
  };
}

// A pinned note's flight (#88), as numbers: the translate and scale that put
// the box it is flying to back over the box it is flying from, for the flight
// to let go of. The scale is about the target's centre (CSS's default origin).
// What has to line up is the paper, not the box: a composed note is taller
// than its square of paper by the fastener's headroom, all of it above, and
// the sheet on the mat has none — so the correction is whatever headroom the
// two boxes differ by, in the flight's own scale. Between two boxes of the
// same shape (the Spotlight and a wall tile) that is nothing.
// ponytail: centres off the rotated bounding boxes, which is out by a pixel
// or two at the steepest tilt; unrotate the boxes if a flight ever shows a
// nudge.
export function flightTransform(
  from: Box,
  to: Box,
): { dx: number; dy: number; scale: number } {
  const scale = from.width / to.width;
  const headroom = scale * (to.height - to.width) - (from.height - from.width);
  const { dx, dy } = centreOffset(from, to);
  return { dx, dy: dy - headroom / 2, scale };
}

// A note's flight from where it was into where it is going: a FLIP. The target
// is already laid out where it belongs (Last); it is put back over the box the
// note came from (First, measured before anything changed) by an inverse
// transform (Invert), which is then let go under a transition (Play). No
// animation library (#69).
export function flyTo(
  from: DOMRect | undefined,
  target: HTMLElement | null,
): void {
  if (!target || !from) return; // nothing to fly, or nowhere to fly it
  // Both flights end at the top of the page: the Spotlight is fixed to the
  // viewport, and the wall's newest slot leads its first row. After the guard
  // above, so a tile that mounts with no flight waiting doesn't scroll anyone.
  window.scrollTo(0, 0);
  const to = target.getBoundingClientRect();
  if (!to.width) return; // nothing laid out (jsdom)
  const { dx, dy, scale } = flightTransform(from, to);
  target.style.transition = "none";
  target.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  // Reading layout here makes the browser take the start position before the
  // end one, or the two collapse into no motion at all.
  target.getBoundingClientRect();
  target.style.transition = `transform ${SLIDE_MS}ms ${EASE_OUT}`;
  target.style.transform = "";
}

// The submit's flight (#88) crosses a navigation: the note is measured while it
// still hangs in the Spotlight, and the tile it flies home into is only laid
// out afterwards, by the wall the navigation lands on. The rect waits here in
// between — the two sides share this module and nothing else.
let leftBehind: DOMRect | undefined;

export function flyingFrom(rect: DOMRect | undefined): void {
  leftBehind = rect;
}

// Taken once: a tile that mounts for any other reason finds no flight waiting.
export function flightHome(): DOMRect | undefined {
  const from = leftBehind;
  leftBehind = undefined;
  return from;
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
