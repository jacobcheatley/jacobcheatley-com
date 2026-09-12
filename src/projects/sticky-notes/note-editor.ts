import {
  CANVAS,
  MAX_ELEMENTS,
  type NoteContent,
  PAPER_COLOURS,
} from "./note-schema";

// The editor's pure model layer: seeding a blank note and the immutable
// element operations (add / update / move / remove) plus the geometry the
// interaction shell needs (bounds, hit-test, off-note). No React, no DOM — so
// the tricky bits (drag-off-to-delete, topmost hit-test, coord clamping) are
// unit-tested here and StickyEditor stays a thin pointer→model shell.

export type Element = NoteContent["elements"][number];

// Must match note-render's sticker base size, so an editor hit-box matches the
// rendered glyph. Kept local (note-render doesn't export it) — one number.
const STICKER_BASE = 48;

// Schema allows -50..550 (a little off-paper slack); clamp raw pointer input so
// a wild drag can't emit an out-of-range coord the contract would reject.
export const clampCoord = (n: number): number =>
  Math.max(-50, Math.min(550, n));

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
      points: el.points.map(([x, y, p]) => [
        clampCoord(x + dx),
        clampCoord(y + dy),
        p,
      ]),
    };
  }
  return { ...el, x: clampCoord(el.x + dx), y: clampCoord(el.y + dy) };
}

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

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

// Approximate axis-aligned bounds in note coords, used for selection, hit-test
// and off-note detection. ponytail: bbox only — a rotated or fat element
// hit-tests as its box, not its exact silhouette. Fine for select/move here.
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
    return { x0: el.x - r, y0: el.y - r, x1: el.x + r, y1: el.y + r };
  }
  // text: anchored at its baseline (x, y); box runs right by w and spans one
  // line's height around the baseline.
  return {
    x0: el.x,
    y0: el.y - el.fontSize,
    x1: el.x + el.w,
    y1: el.y + el.fontSize * 0.3,
  };
}

// True when the element sits entirely off the paper (0..CANVAS both axes) —
// the drag-off-to-delete test.
export function isOffNote(el: Element): boolean {
  const b = bounds(el);
  return b.x1 < 0 || b.x0 > CANVAS || b.y1 < 0 || b.y0 > CANVAS;
}

// Index of the topmost (last-drawn) element whose bounds contain (x, y), or -1.
export function hitTest(content: NoteContent, x: number, y: number): number {
  for (let i = content.elements.length - 1; i >= 0; i--) {
    const el = content.elements[i];
    if (!el) continue;
    const b = bounds(el);
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return i;
  }
  return -1;
}
