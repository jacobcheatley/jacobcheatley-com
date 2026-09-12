import { getStroke } from "perfect-freehand";
import { FONT_FAMILIES } from "./note-fonts";
import type { Ink, NoteContent, PaperColour } from "./note-schema";

// The one pure, state-free renderer: note `content` JSON → SVG. Every surface
// (wall tile, zoom view, editor, approval CLI) uses it, so notes render
// identically everywhere. No hooks, no DOM, no side effects — it must run under
// `renderToStaticMarkup` in a non-browser context (the CLI, #62).
//
// Rotation / curl / fastener are NOT drawn here; consumers render them in CSS
// around this SVG. The semantic colour keys resolve to shades below, in render
// code, so stored notes never need migrating when the palette is re-tuned.

// Paper backgrounds — soft, saturated sticky-note stock.
const PAPER: Record<PaperColour, string> = {
  yellow: "#fde68a",
  pink: "#fbcfe8",
  blue: "#bfdbfe",
  green: "#bbf7d0",
  orange: "#fed7aa",
  white: "#f8fafc",
};

// Marker inks — bold and legible on any paper.
const INK: Record<Ink, string> = {
  black: "#1f2937",
  green: "#16a34a",
  red: "#dc2626",
  blue: "#2563eb",
};

const STROKE_OPTS = {
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
};
const STICKER_BASE = 48; // px at scale 1

type NoteElement = NoteContent["elements"][number];

// perfect-freehand's outline polygon → an SVG path (the median-quadratic helper
// from its docs). noUncheckedIndexedAccess-safe via destructuring defaults.
function svgPathFromStroke(stroke: number[][]): string {
  if (stroke.length < 2) return "";
  const [fx = 0, fy = 0] = stroke[0] ?? [];
  const parts: (string | number)[] = ["M", fx, fy, "Q"];
  for (let i = 0; i < stroke.length; i++) {
    const [x0 = 0, y0 = 0] = stroke[i] ?? [];
    const [x1 = 0, y1 = 0] = stroke[(i + 1) % stroke.length] ?? [];
    parts.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  parts.push("Z");
  return parts.join(" ");
}

// ponytail: naive width→char estimate (avg glyph ≈ 0.55·fontSize) plus explicit
// newlines. Good enough for the wall/CLI; swap for real text measurement if
// wrapping visibly drifts from the editor.
function wrapLines(text: string, width: number, fontSize: number): string[] {
  const maxChars = Math.max(1, Math.floor(width / (fontSize * 0.55)));
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Array order IS z-order and element identity (no stored id) and this render
// never reorders, so the array index is the correct, stable React key.
function renderElement(el: NoteElement, index: number) {
  switch (el.type) {
    case "stroke":
      return (
        <path
          key={index}
          d={svgPathFromStroke(
            getStroke(el.points, { ...STROKE_OPTS, size: el.size }),
          )}
          fill={INK[el.ink]}
        />
      );
    case "text":
      return (
        <text
          key={index}
          x={el.x}
          y={el.y}
          fill={INK[el.color]}
          fontFamily={FONT_FAMILIES[el.font]}
          fontSize={el.fontSize}
          transform={`rotate(${el.rotation} ${el.x} ${el.y})`}
        >
          {wrapLines(el.text, el.w, el.fontSize).map((line, li) => (
            <tspan
              // biome-ignore lint/suspicious/noArrayIndexKey: wrapped lines are positional.
              key={li}
              x={el.x}
              dy={li === 0 ? el.fontSize : el.fontSize * 1.2}
            >
              {line}
            </tspan>
          ))}
        </text>
      );
    case "sticker":
      return (
        <text
          key={index}
          x={el.x}
          y={el.y}
          fontSize={STICKER_BASE * el.scale}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(${el.rotation} ${el.x} ${el.y})`}
        >
          {el.emoji}
        </text>
      );
  }
}

export function NoteRender({ content }: { content: NoteContent }) {
  return (
    <svg
      viewBox="0 0 500 500"
      width="100%"
      height="100%"
      role="img"
      aria-label="sticky note"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={500} height={500} fill={PAPER[content.colour]} />
      {content.elements.map(renderElement)}
    </svg>
  );
}
