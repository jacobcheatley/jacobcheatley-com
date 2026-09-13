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
// the tricky bits (topmost hit-test, coord clamping, the note's own turn and
// curl) are unit-tested here, and the shell stays thin: it maps pointers onto
// these calls and holds no model logic of its own.
//
// A placed element never changes again (#79): the move and handle maths below
// is for the element still being placed (#80). `moveElement` is unclamped, and
// `settleElement` brings the result back inside the schema's -50..550 range, so
// out-of-range coords are never stored; `isOffNote` tells the shell a sticker
// has been dragged off the paper, back to its sheet.

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
export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const clampCoord = (n: number): number => round1(clamp(n, -50, 550));

// Degrees, brought back inside the contract's -180..180 after an addition.
const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

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

export function removeElement(
  content: NoteContent,
  index: number,
): NoteContent {
  return {
    ...content,
    elements: content.elements.filter((_, i) => i !== index),
  };
}

// Rigid, unclamped translation: every point moves by the same delta, so a
// stroke keeps its shape instead of squashing flat against an edge, and an
// element can be dragged fully off the paper. Rounded to a tenth like
// clampCoord: a drag's deltas are differences of floats, and their dust would
// otherwise be stored.
// `<E extends Element>` hands back the same kind of element it was given, so a
// moved text box is still known to be a text box. TS can't follow that generic
// through an object spread, hence the `as E`.
export function moveElement<E extends Element>(
  el: E,
  dx: number,
  dy: number,
): E {
  if (el.type === "stroke")
    return {
      ...el,
      points: el.points.map(([x, y, p]) => [round1(x + dx), round1(y + dy), p]),
    } as E;
  return { ...el, x: round1(el.x + dx), y: round1(el.y + dy) } as E;
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
export function settleElement<E extends Element>(el: E): E {
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
  return dx === 0 && dy === 0 ? el : moveElement(el, dx, dy);
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

// Axis-aligned bounds in the element's own (unrotated) frame, used for the
// outline, the box hit-test and off-note detection. ponytail: a stroke is
// still its bbox here — only hit-testing walks the real polyline — which is
// all the outline and off-note tests need.
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

// Rotate (x, y) by deg about (cx, cy) — the same turn the renderer puts on a
// rotated element, so a handle drawn through this lands on the corner of the
// box the visitor can see.
export function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number,
): [number, number] {
  if (deg === 0) return [x, y];
  const a = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [
    cx + dx * Math.cos(a) - dy * Math.sin(a),
    cy + dx * Math.sin(a) + dy * Math.cos(a),
  ];
}

// The point as the element's own, unrotated frame sees it, so a box test works
// on a rotated element.
const unrotate = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number,
): [number, number] => rotatePoint(x, y, cx, cy, -deg);

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

// True when the element sits entirely off the paper (0..CANVAS both axes).
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
  const [x, y] = unrotate(
    client[0],
    client[1],
    centre[0],
    centre[1],
    rotationDeg,
  );
  const k = CANVAS / side;
  return [CANVAS / 2 + (x - centre[0]) * k, CANVAS / 2 + (y - centre[1]) * k];
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
// No sliders anywhere (#69): in hand mode the note is turned by a drag anywhere
// on it and peeled by its corners, so the sheet itself is the control. All of
// it is geometry, so all of it is here — the shell only decides which gesture a
// pointer started.

// Must match note-render's fold size, like STICKER_BASE above: one number, kept
// here rather than pulling the renderer's JSX into the model layer.
export const MAX_FOLD = 120;

// How close to the paper's centre, in note units, a turn has no angle worth
// reading: a hair of movement there swings the pointer's angle right round.
// Moves inside it are ignored, and a turn pressed there reads its angle from
// where the pointer first leaves.
export const SPIN_DEAD = 40;

export const outsideSpinDead = (x: number, y: number): boolean =>
  Math.hypot(x - CANVAS / 2, y - CANVAS / 2) > SPIN_DEAD;

// The note's two peelable corners, as `content.curl` names them.
export type Corner = "bl" | "br";

// How far from a bottom corner still counts as taking hold of the fold.
export const CURL_GRAB = 40;

// Which bottom corner a pointer took hold of, if either: within reach of the
// corner it peels from, or anywhere on the fold. The flap is drawn folded back
// over the sheet, so it and the triangle cut away from under it together fill
// the square of the fold's size in the corner — and the flap is what you see.
export function curlCorner(
  curl: { bl: number; br: number },
  x: number,
  y: number,
): Corner | null {
  const held = (cx: number, cy: number, fold: number) =>
    Math.hypot(x - cx, y - cy) <= CURL_GRAB ||
    Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= fold;
  if (held(0, CANVAS, curl.bl * MAX_FOLD)) return "bl";
  if (held(CANVAS, CANVAS, curl.br * MAX_FOLD)) return "br";
  return null;
}

// The curl a drag leaves a corner at: the curl it had when taken hold of, plus
// how far the pointer has since pulled in along the corner's own diagonal.
// Relative, so taking hold of the flap doesn't snap the fold to the pointer.
// Only the diagonal counts: sliding along the crease peels nothing.
export function curlFromPointer(
  corner: Corner,
  start: number,
  from: [number, number],
  now: [number, number],
): number {
  const inward = ([x, y]: [number, number]) =>
    ((corner === "bl" ? x : CANVAS - x) + CANVAS - y) / Math.SQRT2;
  return round2(clamp(start + (inward(now) - inward(from)) / MAX_FOLD, 0, 1));
}

// ponytail: the wall looks wrong past a light tilt, so a note is held to +-25
// even though the contract allows a half turn either way. If a sideways note
// is ever wanted, this is the only number in the way.
export const ROTATE_LIMIT = 25;

// The note's tilt after a gesture has swept `by` degrees round its centre.
// The sweep is normalised first: dragging across the centre flips atan2 by a
// whole turn, which would otherwise fling the note to the far clamp.
export const turnNote = (from: number, by: number): number =>
  round1(clamp(from + wrap180(by), -ROTATE_LIMIT, ROTATE_LIMIT));

// Degrees from one point out to another: the sweep a turn of the note, two
// fingers and `rotationFromHandle` all read their angle from.
export const angleOf = (from: [number, number], to: [number, number]): number =>
  (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;

// --- an element's own handles (#76, #80) ------------------------------------
// Only the element being placed has handles (a placed one never changes, #79):
// a corner handle that only turns it, and on a text box a right-edge handle for
// the width it wraps at.

// The handles are drawn small (they sit on a note, not a toolbar) but caught
// big: this is the target's width in CSS px, for the shell to size into note
// units against however large the sheet is rendered.
export const HANDLE_TOUCH = 48;

// An element turned by `by` degrees. Unlike the note (turnNote, held to a tilt
// the wall can wear) an element may face any way at all, so a turn past half a
// circle comes round the other side rather than sticking at the contract's end.
export const turnElement = (from: number, by: number): number =>
  round1(wrap180(from + wrap180(by)));

// Where an element's handles sit, in note coordinates — already turned by the
// element's own rotation, like the box they hang off. A stroke has none: it is
// drawn, not placed, and the eraser is how it goes.
export type Handles = {
  corner: [number, number];
  width: [number, number] | null;
};

export function elementHandles(el: Element): Handles | null {
  if (el.type === "stroke") return null;
  const b = bounds(el);
  const at = (x: number, y: number) =>
    rotatePoint(x, y, el.x, el.y, el.rotation);
  return {
    corner: at(b.x1, b.y1),
    width: el.type === "text" ? at(b.x1, (b.y0 + b.y1) / 2) : null,
  };
}

// The handle a press took hold of: the nearest one within reach. On a one-line
// text box the two sit closer together than a thumb is wide, so taking the
// first in range would leave the corner out of reach behind the width handle.
export function grabbedHandle(
  handles: Handles,
  x: number,
  y: number,
  reach: number,
): "corner" | "width" | null {
  const dist = (at: [number, number] | null) =>
    at ? Math.hypot(x - at[0], y - at[1]) : Infinity;
  const corner = dist(handles.corner);
  const width = dist(handles.width);
  if (Math.min(corner, width) > reach) return null;
  return width < corner ? "width" : "corner";
}

// The part of the element being placed that a press took hold of.
export type PlacingGrip = "corner" | "width" | "move";

// What a press at (x, y) takes hold of on the element being placed (#80): a
// handle, its body to move it, or nothing — a press away, which fixes it.
// `reach` is a thumb's reach in note units, used for every pointer, a mouse's
// too. Outside the element a handle is caught from all of it; over the body
// only from half, or a sticker, whose corner is nearer its middle than a thumb
// is wide on a phone, could never be moved at all.
export function grabPlacing(
  el: Element,
  x: number,
  y: number,
  reach: number,
): PlacingGrip | null {
  const onBody = hitsElement(el, x, y);
  const handles = elementHandles(el);
  const handle =
    handles && grabbedHandle(handles, x, y, onBody ? reach / 2 : reach);
  if (handle) return handle;
  return onBody ? "move" : null;
}

// One drag of the corner handle: the element's rotation when it was taken hold
// of, plus how far round its anchor (x, y) — the point the renderer turns it
// about — the pointer has since swung. Only the angle counts, never the reach:
// the handle turns, it does not resize.
export function rotationFromHandle(
  el: { x: number; y: number; rotation: number },
  from: [number, number],
  now: [number, number],
): number {
  const anchor: [number, number] = [el.x, el.y];
  // taken hold of right on the anchor: no direction to read, so hold still
  if (Math.hypot(from[0] - el.x, from[1] - el.y) < 1) return el.rotation;
  return turnElement(el.rotation, angleOf(anchor, now) - angleOf(anchor, from));
}

// The element being placed as it goes onto the note for good: text trimmed,
// and an empty box is nothing to add.
export function fixedElement(el: Element): Element | null {
  if (el.type !== "text") return el;
  const text = el.text.trim();
  return text ? { ...el, text } : null;
}

// Narrower than this and a text box wraps one letter per line.
export const MIN_TEXT_W = 40;

// A text box's width from the pointer on its right-edge handle: how far along
// the box's OWN x-axis the pointer has reached, so widening a turned box pulls
// along the text rather than across the screen.
export function widthFromPointer(
  el: { x: number; y: number; rotation: number },
  x: number,
  y: number,
): number {
  const [along] = unrotate(x, y, el.x, el.y, el.rotation);
  return clamp(Math.round(along - el.x), MIN_TEXT_W, 600);
}
