import { getStroke } from "perfect-freehand";
import { useId } from "react";
import { FONT_FAMILIES } from "./note-fonts";
import type { Ink, NoteContent, PaperColour } from "./note-schema";

// The one pure, state-free renderer: note `content` JSON → SVG. Every surface
// (wall tile, zoom view, editor, approval CLI) uses it, so notes render
// identically everywhere. No state, no effects, no DOM reads — it must run under
// `renderToStaticMarkup` in a non-browser context (the CLI, #62). `useId` is the
// one hook used, purely for collision-free SVG ids when many notes share a page.
//
// Rotation renders in CSS *around* this SVG (handled by consumers); the corner
// curl fold and the fastener render *inside* the SVG so they look identical
// everywhere. The semantic colour keys resolve to shades here, in render code,
// so stored notes never need migrating when the palette is re-tuned.

const CANVAS = 500;
const MAX_FOLD = 120; // px a corner peels in at curl = 1

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
type Point = [number, number];

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

// Paper outline, clockwise from top-left, with each bottom corner clipped back
// by its fold size so the peeled triangle reveals whatever's behind the note.
function paperPath(fbl: number, fbr: number): string {
  const c = CANVAS;
  return [
    "M 0 0",
    `L ${c} 0`,
    `L ${c} ${c - fbr}`,
    `L ${c - fbr} ${c}`,
    `L ${fbl} ${c}`,
    `L 0 ${c - fbl}`,
    "Z",
  ].join(" ");
}

const tri = (a: Point, b: Point, t: Point) =>
  `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} L ${t[0]} ${t[1]} Z`;

// The fastener that presses the note to the board, drawn at the top centre on
// top of everything. Diegetic and decorative; the stored `fastener` key chooses
// which. Rendered here (not in CSS around the SVG) so it looks identical on the
// wall, zoom, editor and CLI.
function renderFastener(fastener: NoteContent["fastener"]) {
  const cx = CANVAS / 2;
  switch (fastener) {
    case "pin": // a push-pin, seen head-on
      return (
        <g>
          <ellipse
            cx={cx}
            cy={54}
            rx={15}
            ry={6}
            fill="#000000"
            opacity={0.15}
          />
          <circle cx={cx} cy={40} r={16} fill="#e11d48" />
          <circle cx={cx - 5} cy={35} r={5} fill="#ffffff" opacity={0.55} />
          <circle cx={cx} cy={40} r={4} fill="#9f1239" />
        </g>
      );
    case "tape": // a translucent strip across the top
      return (
        <g transform={`rotate(-6 ${cx} 28)`}>
          <rect
            x={cx - 68}
            y={6}
            width={136}
            height={40}
            fill="#ffffff"
            fillOpacity={0.4}
            stroke="#ffffff"
            strokeOpacity={0.5}
          />
        </g>
      );
    case "staple": // a bent metal staple
      return (
        <g fill="#9ca3af">
          <rect x={cx - 22} y={30} width={44} height={7} rx={1.5} />
          <rect x={cx - 22} y={30} width={7} height={20} rx={1.5} />
          <rect x={cx + 15} y={30} width={7} height={20} rx={1.5} />
        </g>
      );
    case "stick": // a blob of adhesive putty
      return (
        <g>
          <ellipse
            cx={cx}
            cy={54}
            rx={20}
            ry={6}
            fill="#000000"
            opacity={0.12}
          />
          <ellipse
            cx={cx}
            cy={40}
            rx={22}
            ry={15}
            fill="#a7c7e7"
            opacity={0.92}
          />
          <ellipse
            cx={cx - 7}
            cy={35}
            rx={7}
            ry={4}
            fill="#ffffff"
            opacity={0.4}
          />
        </g>
      );
  }
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
  const uid = useId();
  const clipId = `${uid}-clip`;
  const faceBr = `${uid}-face-br`;
  const faceBl = `${uid}-face-bl`;
  const shadowId = `${uid}-shadow`;

  const c = CANVAS;
  const fbl = content.curl.bl * MAX_FOLD;
  const fbr = content.curl.br * MAX_FOLD;
  const hasFold = fbl > 0 || fbr > 0;
  const paper = paperPath(fbl, fbr);

  return (
    <svg
      viewBox="0 0 500 500"
      width="100%"
      height="100%"
      role="img"
      aria-label="sticky note"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={paper} />
        </clipPath>
        {hasFold && (
          <>
            {/* light paper back, darkening toward the crease, one per corner */}
            <linearGradient id={faceBr} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fbfcfd" />
              <stop offset="1" stopColor="#cdd1d5" />
            </linearGradient>
            <linearGradient id={faceBl} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbfcfd" />
              <stop offset="1" stopColor="#cdd1d5" />
            </linearGradient>
            <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="4"
                floodColor="#000000"
                floodOpacity="0.3"
              />
            </filter>
          </>
        )}
      </defs>

      {/* paper, then content clipped to the (corner-cut) paper shape */}
      <path d={paper} fill={PAPER[content.colour]} />
      <g clipPath={`url(#${clipId})`}>{content.elements.map(renderElement)}</g>

      {/* folded corners last, on top of the content */}
      {fbr > 0 && (
        <path
          d={tri([c - fbr, c], [c, c - fbr], [c - fbr, c - fbr])}
          fill={`url(#${faceBr})`}
          filter={`url(#${shadowId})`}
        />
      )}
      {fbl > 0 && (
        <path
          d={tri([fbl, c], [0, c - fbl], [fbl, c - fbl])}
          fill={`url(#${faceBl})`}
          filter={`url(#${shadowId})`}
        />
      )}

      {/* fastener on top of everything */}
      {renderFastener(content.fastener)}
    </svg>
  );
}
