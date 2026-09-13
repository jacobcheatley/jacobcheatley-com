import {
  CANVAS,
  MAX_ELEMENTS,
  type NoteContent,
  PAPER_COLOURS,
} from "./note-schema";
import { LINE_HEIGHT, wrapLines } from "./note-text";

// The editor's pure model layer: seeding a blank note and the immutable
// element operations (add / update / move / remove) plus the geometry the
// interaction shell needs (bounds, hit-test, off-note). No React, no DOM — so
// the tricky bits (drag-off-to-delete, topmost hit-test, coord clamping) are
// unit-tested here, so the shell that grows on top of this from T4 (pointer
// input lands then) can stay thin: it maps pointers onto these calls and holds
// no model logic of its own.
//
// A drag is deliberately unclamped: `moveElement` lets coordinates leave the
// schema's -50..550 range, because an element that can't leave the paper can
// never be dragged off it to be deleted. Out-of-range coords are editor runtime
// state, never stored — on release the shell deletes the element if `isOffNote`,
// and otherwise calls `settleElement` to shift it back into contract range.

export type Element = NoteContent["elements"][number];

// Must match note-render's sticker base size, so an editor hit-box matches the
// rendered glyph. Kept local (note-render doesn't export it) — one number.
const STICKER_BASE = 48;

// An emoji glyph doesn't fill its em box, so the drawn sticker can sit off the
// centre the box is built around. 0 until T6 tunes it against real glyphs.
export const STICKER_BOX_OFFSET_Y = 0;

// Extra reach around an element's silhouette, so a fingertip near a thin line
// still grabs it.
export const HIT_SLOP = 6;

// Schema allows -50..550 (a little off-paper slack); clamp raw pointer input so
// a wild drag can't emit an out-of-range coord the contract would reject. It
// also rounds to a tenth of a unit — finer than any screen can show, and it
// keeps the float noise a tilted note's rotation leaves behind (250.00000000003)
// out of the stored JSON, where a long stroke pays for every digit.
export const clampCoord = (n: number): number =>
  Math.round(Math.max(-50, Math.min(550, n)) * 10) / 10;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Blank note with seeded cosmetics — paper colour / rotation / curl are
// seeded-random per note (spec #49), lightly adjustable in the tray. Fastener
// starts "none": choosing one IS the submit, so it isn't pre-seeded.
export function emptyNote(rand: () => number = Math.random): NoteContent {
  const colour =
    PAPER_COLOURS[Math.floor(rand() * PAPER_COLOURS.length)] ?? "yellow";
  return {
    version: 1,
    w: CANVAS,
    h: CANVAS,
    colour,
    rotation: round1(rand() * 8 - 4), // -4..4°
    curl: { bl: round2(rand() * 0.4), br: round2(rand() * 0.4) },
    fastener: "none",
    elements: [],
  };
}

// Append (array order is z-order). Silently refuses past the element cap so the
// editor can call it unconditionally; the contract enforces the cap anyway.
export function addElement(content: NoteContent, el: Element): NoteContent {
  if (content.elements.length >= MAX_ELEMENTS) return content;
  return { ...content, elements: [...content.elements, el] };
}

export function updateElement(
  content: NoteContent,
  index: number,
  el: Element,
): NoteContent {
  if (index < 0 || index >= content.elements.length) return content;
  const elements = content.elements.slice();
  elements[index] = el;
  return { ...content, elements };
}

export function removeElement(
  content: NoteContent,
  index: number,
): NoteContent {
  return {
    ...content,
    elements: content.elements.filter((_, i) => i !== index),
  };
}

function translate(el: Element, dx: number, dy: number): Element {
  if (el.type === "stroke") {
    return {
      ...el,
      points: el.points.map(([x, y, p]) => [x + dx, y + dy, p]),
    };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

// Rigid, unclamped translation: every point moves by the same delta, so a
// stroke keeps its shape instead of squashing flat against an edge, and an
// element can be dragged fully off the paper (which is how you delete it).
// The shell settles or deletes on release — see the module header.
export function moveElement(
  content: NoteContent,
  index: number,
  dx: number,
  dy: number,
): NoteContent {
  const el = content.elements[index];
  if (!el) return content;
  return updateElement(content, index, translate(el, dx, dy));
}

// The minimal shift that brings [lo, hi] back inside -50..550. A span wider
// than the range can't fit, so its minimum goes to -50 and the overflow hangs
// off the far end (unreachable via clampCoord'd input, but cheap to be safe).
function settleShift(lo: number, hi: number): number {
  const d = hi > 550 ? 550 - hi : 0;
  return lo + d < -50 ? -50 - lo : d;
}

// Drop an element back into the contract's coordinate range after an unclamped
// drag: the smallest rigid shift that puts every STORED coordinate inside
// -50..550 (a stroke's points; a text or sticker anchor — the schema constrains
// coords, not silhouettes). Returns the element unchanged when it already fits.
export function settleElement(el: Element): Element {
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  if (el.type === "stroke") {
    const xs = el.points.map(([x]) => x);
    const ys = el.points.map(([, y]) => y);
    x0 = Math.min(...xs);
    x1 = Math.max(...xs);
    y0 = Math.min(...ys);
    y1 = Math.max(...ys);
  } else {
    x0 = el.x;
    x1 = el.x;
    y0 = el.y;
    y1 = el.y;
  }
  const dx = settleShift(x0, x1);
  const dy = settleShift(y0, y1);
  return dx === 0 && dy === 0 ? el : translate(el, dx, dy);
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

// Axis-aligned bounds in the element's own (unrotated) frame, used for the
// selection outline, the box hit-test and off-note detection. ponytail: a
// stroke is still its bbox here — only hit-testing walks the real polyline —
// which is all the move clamp and drag-off-to-delete need.
export function bounds(el: Element): Bounds {
  if (el.type === "stroke") {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of el.points) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const r = el.size / 2;
    return { x0: x0 - r, y0: y0 - r, x1: x1 + r, y1: y1 + r };
  }
  if (el.type === "sticker") {
    const r = (STICKER_BASE * el.scale) / 2;
    const cy = el.y + STICKER_BOX_OFFSET_Y;
    return { x0: el.x - r, y0: cy - r, x1: el.x + r, y1: cy + r };
  }
  // text: (x, y) is the block's top-left — the renderer drops the first
  // baseline to y + fontSize — and each wrapped line adds a LINE_HEIGHT.
  const lines = wrapLines(el.text, el.w, el.fontSize).length;
  return {
    x0: el.x,
    y0: el.y,
    x1: el.x + el.w,
    y1: el.y + el.fontSize * (1 + (lines - 1) * LINE_HEIGHT),
  };
}

// Rotate (x, y) by -deg about (cx, cy): the point as the element's own,
// unrotated frame sees it, so a box test works on a rotated element.
function unrotate(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number,
): [number, number] {
  if (deg === 0) return [x, y];
  const a = (-deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [
    cx + dx * Math.cos(a) - dy * Math.sin(a),
    cy + dx * Math.sin(a) + dy * Math.cos(a),
  ];
}

// Distance from (px, py) to the segment ab — the standard projection-onto-the
// -segment clamp. A zero-length segment degenerates to point distance, which is
// what a one-point stroke (a dot) needs.
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

// Does the point land on the element's real silhouette? A stroke is its
// polyline (its bounding box would swallow the hole in a drawn circle); text
// and stickers are their box, seen through their own rotation.
function hitsElement(el: Element, x: number, y: number): boolean {
  if (el.type === "stroke") {
    const reach = el.size / 2 + HIT_SLOP;
    const pts = el.points;
    const first = pts[0];
    if (!first) return false;
    if (pts.length === 1)
      return Math.hypot(x - first[0], y - first[1]) <= reach;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (a && b && distToSegment(x, y, a[0], a[1], b[0], b[1]) <= reach)
        return true;
    }
    return false;
  }
  const [px, py] = unrotate(x, y, el.x, el.y, el.rotation);
  const b = bounds(el);
  return px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1;
}

// True when the element sits entirely off the paper (0..CANVAS both axes) —
// the drag-off-to-delete test.
export function isOffNote(el: Element): boolean {
  const b = bounds(el);
  return b.x1 < 0 || b.x0 > CANVAS || b.y1 < 0 || b.y0 > CANVAS;
}

// Every element under (x, y), topmost (last-drawn) first. Repeated taps on the
// same spot cycle through this list, so an element buried under another is
// still reachable.
export function hitTestAll(
  content: NoteContent,
  x: number,
  y: number,
): number[] {
  const found: number[] = [];
  for (let i = content.elements.length - 1; i >= 0; i--) {
    const el = content.elements[i];
    if (el && hitsElement(el, x, y)) found.push(i);
  }
  return found;
}

// Index of the topmost element under (x, y), or -1.
export function hitTest(content: NoteContent, x: number, y: number): number {
  return hitTestAll(content, x, y)[0] ?? -1;
}

// The next hit after the current selection, wrapping — tapping the same spot
// again digs one layer down. Anything else selected (or nothing) starts at the
// top.
export function cycleHit(hits: number[], selected: number): number {
  const i = hits.indexOf(selected);
  return (i === -1 ? hits[0] : hits[(i + 1) % hits.length]) ?? -1;
}

// --- the note's own geometry (#76) ------------------------------------------
// The paper renders rotated on the mat, so a client point means nothing until
// it has come back through that rotation. This is the whole mapping, pure: the
// shell measures the paper and hands it over.

// Client point → note units. `centre` is the paper's centre (the bounding box's
// centre IS the rotation centre) and `side` its rendered, unrotated side.
export function clientToNoteCoords(
  client: [number, number],
  centre: [number, number],
  side: number,
  rotationDeg: number,
): [number, number] {
  const a = (-rotationDeg * Math.PI) / 180;
  const dx = client[0] - centre[0];
  const dy = client[1] - centre[1];
  const k = CANVAS / side;
  return [
    CANVAS / 2 + (dx * Math.cos(a) - dy * Math.sin(a)) * k,
    CANVAS / 2 + (dx * Math.sin(a) + dy * Math.cos(a)) * k,
  ];
}

// The rendered side of the square sheet, from the box a rotated one occupies.
// Derived rather than read off `offsetWidth`: that is the LAYOUT size, and the
// note is scaled down while the sticker sheet is up, which would put every
// pointer a quarter of a note away from where it really is.
export function noteSide(bboxWidth: number, rotationDeg: number): number {
  const a = (rotationDeg * Math.PI) / 180;
  return bboxWidth / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)));
}

// --- the paper's own handles (#76) ------------------------------------------
// No sliders anywhere (#69): the note is turned by its edge and peeled by its
// corners, so the sheet itself is the control. All of it is geometry, so all of
// it is here — the shell only decides which gesture a pointer started.

export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

// Must match note-render's fold size, like STICKER_BASE above: one number, kept
// here rather than pulling the renderer's JSX into the model layer.
export const MAX_FOLD = 120;

// The band along the paper's edge that turns the note. Narrow enough that the
// middle of the sheet stays drawing surface, wide enough to find with a thumb.
export const EDGE_BAND = 24;

export function isEdgeBand(x: number, y: number): boolean {
  if (x < 0 || x > CANVAS || y < 0 || y > CANVAS) return false;
  return (
    x < EDGE_BAND ||
    y < EDGE_BAND ||
    x > CANVAS - EDGE_BAND ||
    y > CANVAS - EDGE_BAND
  );
}

// How far from a bottom corner still counts as taking hold of the fold.
export const CURL_GRAB = 40;

// Which bottom corner a pointer took hold of, if either: anywhere inside the
// folded triangle itself, or within reach of the corner it peels from.
export function curlCorner(
  curl: { bl: number; br: number },
  x: number,
  y: number,
): "bl" | "br" | null {
  const held = (cx: number, cy: number, fold: number) =>
    Math.hypot(x - cx, y - cy) <= CURL_GRAB ||
    // the fold triangle: the two legs and the crease between their ends
    Math.abs(x - cx) + Math.abs(y - cy) <= fold;
  if (held(0, CANVAS, curl.bl * MAX_FOLD)) return "bl";
  if (held(CANVAS, CANVAS, curl.br * MAX_FOLD)) return "br";
  return null;
}

// How far the pointer has pulled a corner in along its own diagonal, as a curl.
// Pulling straight up an edge peels nothing: it is the diagonal into the middle
// of the sheet that lifts paper.
export function curlFromPointer(
  corner: "bl" | "br",
  x: number,
  y: number,
): number {
  const dx = corner === "bl" ? x : CANVAS - x;
  const dy = CANVAS - y;
  return clamp((dx + dy) / Math.SQRT2 / MAX_FOLD, 0, 1);
}

// ponytail: the wall looks wrong past a light tilt, so a note is held to +-25
// even though the contract allows a half turn either way. If a sideways note
// is ever wanted, this is the only number in the way.
export const ROTATE_LIMIT = 25;

// The note's tilt after a gesture has swept `by` degrees round its centre.
// The sweep is normalised first: dragging across the centre flips atan2 by a
// whole turn, which would otherwise fling the note to the far clamp.
export function turnNote(from: number, by: number): number {
  const swept = ((((by + 180) % 360) + 360) % 360) - 180;
  return Math.round(clamp(from + swept, -ROTATE_LIMIT, ROTATE_LIMIT) * 10) / 10;
}
