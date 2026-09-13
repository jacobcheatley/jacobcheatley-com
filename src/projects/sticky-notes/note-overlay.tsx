import { FontChip } from "./desk-objects";
import {
  bounds,
  type Corner,
  EDGE_BAND,
  elementHandles,
  MAX_FOLD,
  type Element as NoteElement,
  rotatePoint,
} from "./note-editor";
import { INK } from "./note-render";
import { CANVAS, FONTS, type Font, type NoteContent } from "./note-schema";
import { LINE_HEIGHT, wrapLines } from "./note-text";

// What the editor draws over the note: the caret, the grip, the selection's
// outline and handles, and the font bar. Stateless — handed an element, it
// draws it — so it lives apart from StickyEditor's gesture shell, which only
// decides what shows.

type TextEl = Extract<NoteElement, { type: "text" }>;

const CARET_MS = 1000; // one blink, on a step: a cursor snaps, it doesn't fade

// How big a handle is drawn, in note units: small, since it sits on a note.
// StickyEditor catches it from much further away (HANDLE_TOUCH).
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
  // order, so the draft's index IS its node — which a re-edited box in the
  // middle of the note needs, and "the last text on the paper" could not give.
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

// What the hand has hold of, or a mouse is over: the band along the edge that
// turns the note, or the crease of the corner that peels.
export function gripMark(grip: "edge" | Corner, curl: NoteContent["curl"]) {
  if (grip === "edge")
    return (
      <rect
        data-grip={grip}
        x={EDGE_BAND / 2}
        y={EDGE_BAND / 2}
        width={CANVAS - EDGE_BAND}
        height={CANVAS - EDGE_BAND}
        fill="none"
        stroke="#1f2937"
        strokeOpacity={0.14}
        strokeWidth={EDGE_BAND}
      />
    );
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

// The dashed box around the selection, in note units — inside the element's
// own rotation, so the outline lies on the thing rather than around it. A
// stroke has no rotation of its own: its box is the ink's.
export function selectionRect(el: NoteElement) {
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

// The selection's handles: one at the box's far corner that scales and turns
// in a single drag, and on a text box a second on its right edge for the width
// it wraps at. Drawn small — they sit on a note, not a toolbar — and caught
// from HANDLE_TOUCH px away.
export function handleMarks(el: NoteElement) {
  const handles = elementHandles(el);
  if (!handles) return null;
  const knob = (at: [number, number], r: number) => (
    <circle
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
      {handles.width && knob(handles.width, HANDLE_R - 2)}
      {knob(handles.corner, HANDLE_R)}
    </>
  );
}

// The font samples for a selected text box, standing on its top edge. It rides
// inside the rotated sheet — so it is positioned in plain note units, like
// everything else on the paper — and counter-turns so the samples stay upright
// and readable whichever way the note is lying.
export function FontBar({
  el,
  tilt,
  onPick,
}: {
  el: TextEl;
  tilt: number;
  onPick: (f: Font) => void;
}) {
  const b = bounds(el);
  const [x, y] = rotatePoint((b.x0 + b.x1) / 2, b.y0, el.x, el.y, el.rotation);
  return (
    <div
      className="absolute flex gap-1.5"
      style={{
        left: `${(x / CANVAS) * 100}%`,
        top: `${(y / CANVAS) * 100}%`,
        transform: `translate(-50%, -100%) translateY(-10px) rotate(${-tilt}deg)`,
        transformOrigin: "50% 100%",
      }}
      // The bar lies on the paper, so its presses would otherwise be presses on
      // the paper: a tap on a sample is a choice, not a deselect.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {FONTS.map((f) => (
        <FontChip
          key={f}
          font={f}
          active={f === el.font}
          tint={INK[el.color]}
          onPick={onPick}
        />
      ))}
    </div>
  );
}
