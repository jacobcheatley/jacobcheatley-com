import {
  bounds,
  type Corner,
  elementHandles,
  MAX_FOLD,
  type Element as NoteElement,
} from "./note-editor";
import { INK } from "./note-render";
import { CANVAS, type NoteContent } from "./note-schema";
import { LINE_HEIGHT, wrapLines } from "./note-text";

// What the editor draws over the note: the caret, the grip, and the outline and
// handles of the element being placed (#80). Stateless — handed an
// element, it draws it — so it lives apart from StickyEditor's gesture shell,
// which only decides what shows.

type TextEl = Extract<NoteElement, { type: "text" }>;

const CARET_MS = 1000; // one blink, on a step: a cursor snaps, it doesn't fade

// How big a handle is drawn, in note units: small, since it sits on a note.
// The shell catches it from much further away (HANDLE_TOUCH).
const HANDLE_R = 7;

// The caret's tip, in the text's OWN space: just past the last glyph of the
// last line, on that line's baseline. Measured off the tspans NoteRender
// actually drew — the same ones, so the caret cannot drift from the text — and
// estimated from `wrapLines` when there is nothing to measure yet: the very
// first paint, and jsdom, which lays out no glyphs at all.
export function caretAt(
  paper: HTMLDivElement | null,
  el: TextEl,
  index: number,
): { x: number; y: number } {
  const lines = wrapLines(el.text, el.w, el.fontSize);
  const last = lines[lines.length - 1] ?? "";
  const estimate = {
    x: el.x + last.length * 0.55 * el.fontSize,
    y: el.y + el.fontSize + LINE_HEIGHT * el.fontSize * (lines.length - 1),
  };
  if (!last) return estimate; // an empty line has no glyph to measure from
  // Array order is z-order and the render draws one node per element in that
  // order, so the draft's index IS its node.
  const text = paper?.querySelector("[data-elements]")?.children[index];
  const tspans = text?.querySelectorAll<SVGTSpanElement>("tspan");
  const tspan = tspans?.[tspans.length - 1];
  if (typeof tspan?.getEndPositionOfChar !== "function") return estimate;
  try {
    // Coordinates in the <text>'s own space, before its rotation — so the caret
    // is drawn inside that same rotation (caretRect).
    const end = tspan.getEndPositionOfChar(last.length - 1);
    return { x: end.x, y: end.y };
  } catch {
    // the glyphs are not laid out (a font still loading): the estimate holds
    return estimate;
  }
}

// A bar in the draft's own ink, standing on the baseline. It blinks on a step
// so it reads as a cursor rather than a fade, and holds steady for anyone who
// asked for less motion.
export function caretRect(at: { x: number; y: number }, el: TextEl) {
  const h = el.fontSize * 1.05;
  return (
    <g transform={`rotate(${el.rotation} ${el.x} ${el.y})`}>
      <rect
        data-caret=""
        x={at.x}
        y={at.y - h * 0.82}
        width={Math.max(1.5, el.fontSize / 16)}
        height={h}
        fill={INK[el.color]}
        className="motion-reduce:animate-none!"
        style={{ animation: `desk-caret ${CARET_MS}ms step-end infinite` }}
      />
    </g>
  );
}

// The corner the hand has hold of, or a mouse is over: the crease that peels.
// A turn needs no mark — the note turning under the pointer is the feedback.
export function gripMark(grip: Corner, curl: NoteContent["curl"]) {
  const f = Math.max(curl[grip] * MAX_FOLD, 12);
  return (
    <path
      data-grip={grip}
      d={
        grip === "bl"
          ? `M ${f} ${CANVAS} L 0 ${CANVAS - f}`
          : `M ${CANVAS - f} ${CANVAS} L ${CANVAS} ${CANVAS - f}`
      }
      stroke="#ffffff"
      strokeOpacity={0.75}
      strokeWidth={3}
      strokeLinecap="round"
      fill="none"
    />
  );
}

// The dashed box around an element, in note units — inside the element's own
// rotation, so the outline lies on the thing rather than around it. A stroke
// has no rotation of its own: its box is the ink's.
export function outlineRect(el: NoteElement) {
  const b = bounds(el);
  const box = (
    <rect
      x={b.x0}
      y={b.y0}
      width={b.x1 - b.x0}
      height={b.y1 - b.y0}
      fill="none"
      stroke="#1f2937"
      strokeOpacity={0.65}
      strokeWidth={2}
      strokeDasharray="9 7"
    />
  );
  if (el.type === "stroke") return box;
  return <g transform={`rotate(${el.rotation} ${el.x} ${el.y})`}>{box}</g>;
}

// An element's handles: one at the box's far corner that only turns it, and on
// a text box a second on its right edge for the width it wraps at. Drawn small —
// they sit on a note, not a toolbar — and caught from HANDLE_TOUCH px away.
export function handleMarks(el: NoteElement) {
  const handles = elementHandles(el);
  if (!handles) return null;
  const knob = (at: [number, number], r: number, name: string) => (
    <circle
      data-handle={name}
      cx={at[0]}
      cy={at[1]}
      r={r}
      fill="#f8fafc"
      stroke="#1f2937"
      strokeOpacity={0.75}
      strokeWidth={2}
    />
  );
  return (
    <>
      {handles.width && knob(handles.width, HANDLE_R - 2, "width")}
      {knob(handles.corner, HANDLE_R, "corner")}
    </>
  );
}
