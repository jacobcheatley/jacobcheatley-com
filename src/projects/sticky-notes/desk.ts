import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

// The desk's shared look and motion. StickyMat SSRs with the wall and
// StickyEditor is a lazy chunk, so neither may own constants the other imports:
// a static import either way pulls the editor into the wall's bundle.

// Quick off the mark, long settle.
export const EASE_OUT = "cubic-bezier(.2,.8,.25,1)";

// The mat's slide over the wall and away, and the pinned note's flight onto the
// wall, which rides that same slide down.
export const SLIDE_MS = 500;

// A DOMRect, structurally, so a plain object stands in for one in a test.
type Box = { left: number; top: number; width: number; height: number };

// How far one box's centre is from another's, in px.
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

// Lines up the paper, not the box: a composed note carries the fastener's
// headroom above its square of paper and a sheet on the mat has none, so the
// correction is whatever headroom the two boxes differ by, at the flight's scale.
// ponytail: centres off the rotated bounding boxes, out by a pixel or two at
// the steepest tilt; unrotate the boxes if a flight ever shows a nudge.
export function flightTransform(
  from: Box,
  to: Box,
): { dx: number; dy: number; scale: number } {
  const scale = from.width / to.width;
  const headroom = scale * (to.height - to.width) - (from.height - from.width);
  const { dx, dy } = centreOffset(from, to);
  return { dx, dy: dy - headroom / 2, scale };
}

// A FLIP: the target, already laid out where it belongs, is put back over the
// box the note came from and then let go under a transition.
export function flyTo(
  from: DOMRect | undefined,
  target: HTMLElement | null,
): boolean {
  if (!target || !from) return false;
  // Both flights end at the top of the page. After the guard, so a tile that
  // mounts with no flight waiting doesn't scroll anyone.
  window.scrollTo(0, 0);
  const to = target.getBoundingClientRect();
  if (!to.width) return false; // nothing laid out (jsdom)
  const { dx, dy, scale } = flightTransform(from, to);
  target.style.transition = "none";
  target.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  // Reading layout here makes the browser take the start position before the
  // end one, or the two collapse into no motion at all.
  target.getBoundingClientRect();
  target.style.transition = `transform ${SLIDE_MS}ms ${EASE_OUT}`;
  target.style.transform = "";
  return true;
}

// The Spotlight's scrim goes with its dialog the moment the route changes, a
// frame before the sent note starts home; this afterimage fades over the
// flight, so the dark lifts with the note instead of snapping off.
export function fadeScrim(): void {
  const scrim = document.createElement("div");
  scrim.className = "pointer-events-none fixed inset-0 z-50 bg-black/70";
  scrim.style.transition = `opacity ${SLIDE_MS}ms ${EASE_OUT}`;
  document.body.append(scrim);
  scrim.getBoundingClientRect(); // the start value, taken before the end one
  scrim.style.opacity = "0";
  setTimeout(() => scrim.remove(), SLIDE_MS);
}

// The submit's flight crosses a navigation: the note is measured while it still
// hangs in the Spotlight, and the tile it flies home into is only laid out
// afterwards, by the wall. The rect waits here in between.
// ponytail: one slot for the whole page. Fine while one wall flies one note at
// a time; hand the rect through a context if either changes.
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

// The sticker sheet's ride up from behind the tray, and the note's move out of
// its way, which keeps time with it.
export const SHEET_MS = 500;

// Keep a gesture with the pointer that started it, wherever that pointer
// wanders. The guard is for jsdom (no pointer capture at all) and for a pointer
// id that is no longer live, which throws rather than returning.
export function capturePointer(e: ReactPointerEvent): void {
  try {
    e.currentTarget.setPointerCapture?.(e.pointerId);
  } catch {
    // not a live pointer — carry on without capture
  }
}

// Cool slate cutting mat: grid rules over a dark wash, distinct from the wall's
// warm cork.
export const DESK_BG: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "radial-gradient(120% 120% at 50% 0%, #2a2f36, #171a1f)",
  ].join(", "),
  backgroundSize: "26px 26px, 26px 26px, cover",
};

// A strip of masking tape stuck to the mat: the label style for the mat's own
// controls.
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

// The desk's transitions are inline (their timings are JS constants), and only
// an important rule can switch them off for prefers-reduced-motion.
export const STILL = "motion-reduce:transition-none!";
