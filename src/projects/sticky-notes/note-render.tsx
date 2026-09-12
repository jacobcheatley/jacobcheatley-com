import { getStroke } from "perfect-freehand";
import { useId } from "react";
import { FONT_FAMILIES } from "./note-fonts";
import type { Fastener, Ink, NoteContent, PaperColour } from "./note-schema";
import { wrapLines } from "./note-text";

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
// Transparent board headroom above the note so a fastener (esp. tape) can
// overhang the top edge onto the wall. The note itself stays 0..500. Exported
// so the editor (#61) maps pointer input through the exact same coordinate frame.
export const FASTENER_MARGIN = 40;

// The SVG's width / height. A consumer sizing a tile or zoom box must match this
// exactly or the note crops, so derive it from here rather than re-typing it.
export const NOTE_ASPECT_RATIO = CANVAS / (CANVAS + FASTENER_MARGIN);

// NotePaper drops the headroom, so the bare sheet is square. Named rather than
// inlined for the same reason: the mat sizes its note from here.
export const NOTE_PAPER_ASPECT_RATIO = 1;

// Paper backgrounds — soft, saturated sticky-note stock. Exported so the editor
// (#61) tints its paper/ink swatches from the exact rendered shades.
export const PAPER: Record<PaperColour, string> = {
  yellow: "#fde68a",
  pink: "#fbcfe8",
  blue: "#bfdbfe",
  green: "#bbf7d0",
  orange: "#fed7aa",
  white: "#f8fafc",
};

// Marker inks — bold and legible on any paper. Exported (see PAPER above).
export const INK: Record<Ink, string> = {
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

// Blend two #rrggbb colours: t = 0 → a, t = 1 → b. Tints the fold faces from
// the paper colour so a curled corner shows the same stock, a shade lighter.
function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => Number.parseInt(h.slice(i, i + 2), 16);
  const c = (i: number) =>
    Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${c(1)}${c(3)}${c(5)}`;
}

// ---------------------------------------------------------------------------
// Fasteners fix the note to the board. Rendered inside the SVG (not in CSS
// around it) so they look identical on the wall, zoom, editor and CLI. Drawn in
// 500-canvas units but sized to survive the ~128px wall tile. Light comes from
// the top-left, so every shadow falls down-right, matching the wall's CSS
// drop-shadow. Most sit on top of the note; sticky tack sits behind it.

// Per-render SVG ids: a fastener needs at most one gradient and one blur.
type FastenerIds = { grad: string; blur: string };
const url = (id: string) => `url(#${id})`;

// Pin head colour → [light, mid, dark] radial-gradient stops.
const PIN_SHADES: Partial<Record<Fastener, [string, string, string]>> = {
  "pin-red": ["#fb7185", "#e11d48", "#881337"],
  "pin-green": ["#6ee7a0", "#16a34a", "#14532d"],
  "pin-yellow": ["#fde68a", "#eab308", "#854d0e"],
  "pin-blue": ["#93c5fd", "#2563eb", "#1e3a8a"],
};

// The <defs> a fastener needs: a soft blur for its shadows plus its gradient.
function fastenerDefs(fastener: Fastener, ids: FastenerIds) {
  if (fastener === "none") return null;
  const shades = PIN_SHADES[fastener];
  return (
    <>
      <filter id={ids.blur} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>
      {shades && (
        <radialGradient id={ids.grad} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor={shades[0]} />
          <stop offset="0.55" stopColor={shades[1]} />
          <stop offset="1" stopColor={shades[2]} />
        </radialGradient>
      )}
      {fastener === "tape-clear" && (
        // the sheen of a curved clear strip: bright edges, dim middle
        <linearGradient id={ids.grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.7" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.45" />
        </linearGradient>
      )}
      {(fastener === "staple" || fastener === "staples") && (
        <linearGradient id={ids.grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="0.45" stopColor="#b8bec8" />
          <stop offset="1" stopColor="#6b7280" />
        </linearGradient>
      )}
      {fastener === "stick" && (
        <linearGradient id={ids.grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93aee0" />
          <stop offset="1" stopColor="#5b7fc4" />
        </linearGradient>
      )}
    </>
  );
}

// A push-pin stuck in at an angle: domed head, needle exiting under it into a
// puncture, soft shadow down-right.
function pin(ids: FastenerIds) {
  const cx = CANVAS / 2;
  const cy = 28;
  return (
    <g>
      <ellipse
        cx={cx + 7}
        cy={cy + 24}
        rx={27}
        ry={12}
        fill="#000000"
        opacity={0.3}
        filter={url(ids.blur)}
      />
      <line
        x1={cx + 2}
        y1={cy + 12}
        x2={cx + 13}
        y2={cy + 36}
        stroke="#4b5563"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <line
        x1={cx + 1}
        y1={cy + 12}
        x2={cx + 12}
        y2={cy + 35}
        stroke="#e5e7eb"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <ellipse
        cx={cx + 13.5}
        cy={cy + 36.5}
        rx={3}
        ry={1.6}
        fill="#000000"
        opacity={0.55}
      />
      <circle cx={cx} cy={cy} r={26} fill={url(ids.grad)} />
      <ellipse
        cx={cx - 10}
        cy={cy - 10}
        rx={9}
        ry={5.5}
        fill="#ffffff"
        opacity={0.6}
        transform={`rotate(-35 ${cx - 10} ${cy - 10})`}
      />
    </g>
  );
}

// Tape outlines: a strip x0..x1 × y0..y1 whose short ends are torn (masking)
// or finely serrated (clear). Deterministic, so renders stay identical.
function tornStrip(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  amp = 5,
  step = 7,
): string {
  const pts: Point[] = [
    [x0, y0],
    [x1, y0],
  ];
  for (let y = y0 + step; y < y1; y += step) {
    const dir = Math.round(y / step) % 2 ? 1 : -1;
    pts.push([x1 + dir * amp * (0.6 + 0.4 * Math.sin(y)), y]);
  }
  pts.push([x1, y1], [x0, y1]);
  for (let y = y1 - step; y > y0; y -= step) {
    const dir = Math.round(y / step) % 2 ? -1 : 1;
    pts.push([x0 + dir * amp * (0.6 + 0.4 * Math.cos(y)), y]);
  }
  return pts.map(([x, y]) => `${x.toFixed(1)},${y}`).join(" ");
}

function serratedStrip(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t = 3,
): string {
  const pts: Point[] = [
    [x0, y0],
    [x1, y0],
  ];
  for (let y = y0; y < y1; y += t * 2)
    pts.push([x1 - t, y + t], [x1, y + t * 2]);
  pts.push([x1, y1], [x0, y1]);
  for (let y = y1; y > y0; y -= t * 2)
    pts.push([x0 + t, y - t], [x0, y - t * 2]);
  return pts.map(([x, y]) => `${x},${y}`).join(" ");
}

// Cream masking tape bridging board and note: torn ends, two light streaks,
// faint edge lines, soft shadow.
function tapeMasking(ids: FastenerIds) {
  const cx = CANVAS / 2;
  const outline = tornStrip(cx - 90, -34, cx + 90, 30);
  return (
    <g transform={`rotate(-6 ${cx} 0)`}>
      <polygon
        points={outline}
        fill="#000000"
        opacity={0.18}
        transform="translate(1 4)"
        filter={url(ids.blur)}
      />
      <polygon points={outline} fill="#f4ecc6" fillOpacity={0.7} />
      <line
        x1={cx - 80}
        y1={26}
        x2={cx - 54}
        y2={-30}
        stroke="#ffffff"
        strokeOpacity={0.28}
        strokeWidth={7}
      />
      <line
        x1={cx + 40}
        y1={26}
        x2={cx + 54}
        y2={-30}
        stroke="#ffffff"
        strokeOpacity={0.2}
        strokeWidth={4}
      />
      <line
        x1={cx - 88}
        y1={-33}
        x2={cx + 88}
        y2={-33}
        stroke="#000000"
        strokeOpacity={0.07}
        strokeWidth={1.5}
      />
      <line
        x1={cx - 88}
        y1={29}
        x2={cx + 88}
        y2={29}
        stroke="#000000"
        strokeOpacity={0.09}
        strokeWidth={1.5}
      />
    </g>
  );
}

// Clear tape: a faint blue-white tint, the sheen gradient, a hairline edge and
// one bright streak. Subtle by design.
function tapeClear(ids: FastenerIds) {
  const cx = CANVAS / 2;
  const outline = serratedStrip(cx - 85, -32, cx + 85, 28);
  return (
    <g transform={`rotate(-5 ${cx} 0)`}>
      <polygon
        points={outline}
        fill="#000000"
        opacity={0.12}
        transform="translate(1 3)"
        filter={url(ids.blur)}
      />
      <polygon points={outline} fill="#e8f1ff" fillOpacity={0.28} />
      <polygon points={outline} fill={url(ids.grad)} />
      <polygon
        points={outline}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.55}
        strokeWidth={1}
      />
      <line
        x1={cx - 54}
        y1={26}
        x2={cx - 28}
        y2={-30}
        stroke="#ffffff"
        strokeOpacity={0.5}
        strokeWidth={9}
      />
    </g>
  );
}

// A driven staple centred at (x, y): only the steel crown shows, with a dark
// slit at each end where the legs pierce the paper.
function staple(
  ids: FastenerIds,
  x: number,
  y: number,
  angle: number,
  w: number,
) {
  const l = x - w / 2;
  return (
    <g transform={`rotate(${angle} ${x} ${y})`}>
      <rect
        x={l}
        y={y - 1}
        width={w}
        height={12}
        rx={3}
        fill="#000000"
        opacity={0.3}
        filter={url(ids.blur)}
      />
      <rect
        x={l - 3}
        y={y - 4}
        width={7}
        height={10}
        rx={1.5}
        fill="#111827"
        opacity={0.75}
      />
      <rect
        x={x + w / 2 - 4}
        y={y - 4}
        width={7}
        height={10}
        rx={1.5}
        fill="#111827"
        opacity={0.75}
      />
      <rect
        x={l}
        y={y - 5}
        width={w}
        height={10}
        rx={1.5}
        fill={url(ids.grad)}
      />
      <rect
        x={l + 1}
        y={y - 4.5}
        width={w - 2}
        height={2}
        rx={1}
        fill="#ffffff"
        opacity={0.7}
      />
    </g>
  );
}

// A squished lump of sticky tack centred on x at the note's top edge; only the
// part above y = 0 peeks out from behind the paper. `k` nudges the middle bump
// so the two lumps aren't twins.
function lump(ids: FastenerIds, cx: number, w: number, h: number, k: number) {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const d = [
    `M ${l} 6`,
    `C ${l - 3} ${-h * 0.4} ${l + w * 0.1} ${-h * 0.95} ${l + w * 0.27} ${-h * 0.78}`,
    `C ${l + w * 0.35} ${-h * 0.7} ${l + w * 0.4} ${-h * 1.05} ${l + w * 0.55 + k} ${-h * 0.98}`,
    `C ${l + w * 0.67} ${-h * 0.92} ${l + w * 0.72} ${-h * 0.66} ${l + w * 0.83} ${-h * 0.62}`,
    `C ${r + 2} ${-h * 0.5} ${r + 3} 0 ${r} 6 Z`,
  ].join(" ");
  return (
    <g>
      <path d={d} fill={url(ids.grad)} />
      <ellipse
        cx={l + w * 0.3}
        cy={-h * 0.5}
        rx={w * 0.12}
        ry={h * 0.18}
        fill="#ffffff"
        opacity={0.18}
      />
      {/* the note's own shade falling on the tack along the top edge */}
      <rect
        x={l - 6}
        y={-6}
        width={w + 12}
        height={14}
        fill="#000000"
        opacity={0.3}
        filter={url(ids.blur)}
      />
    </g>
  );
}

// Drawn BEHIND the paper: only sticky tack, one lump under each top corner.
function fastenerBehind(fastener: Fastener, ids: FastenerIds) {
  if (fastener !== "stick") return null;
  return (
    <>
      {lump(ids, 58, 66, 18, 3)}
      {lump(ids, CANVAS - 58, 60, 17, -3)}
    </>
  );
}

// Drawn ON TOP of the note.
function fastenerFront(fastener: Fastener, ids: FastenerIds) {
  switch (fastener) {
    case "none":
    case "stick": // holds by itself / rendered behind
      return null;
    case "pin-red":
    case "pin-green":
    case "pin-yellow":
    case "pin-blue":
      return pin(ids);
    case "tape-masking":
      return tapeMasking(ids);
    case "tape-clear":
      return tapeClear(ids);
    case "staple": // one staple, centred near the top
      return staple(ids, CANVAS / 2, 30, 0, 70);
    case "staples": // one angled across each top corner
      return (
        <>
          {staple(ids, 58, 42, -40, 60)}
          {staple(ids, CANVAS - 58, 42, 40, 60)}
        </>
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

// The paper layer: the sheet, the elements clipped to it, and the folded
// corners — everything except the fastener. Split out so the editor's mat can
// show bare paper (NotePaper) through the exact code the wall renders, while
// NoteRender still composes paper and fastener into the one SVG. Returns the
// two halves because the fastener slots *between* them: tack behind, paper,
// fastener on top.
function paperLayers(uid: string, content: NoteContent) {
  const clipId = `${uid}-clip`;
  const faceBr = `${uid}-face-br`;
  const faceBl = `${uid}-face-bl`;
  const shadowId = `${uid}-shadow`;

  const c = CANVAS;
  const paperFill = PAPER[content.colour];
  const fbl = content.curl.bl * MAX_FOLD;
  const fbr = content.curl.br * MAX_FOLD;
  const hasFold = fbl > 0 || fbr > 0;
  const paper = paperPath(fbl, fbr);
  // fold face: the same stock, lighter at the lifted tip, near-paper at the crease
  const foldTip = mix(paperFill, "#ffffff", 0.6);
  const foldCrease = mix(paperFill, "#ffffff", 0.15);

  return {
    defs: (
      <>
        <clipPath id={clipId}>
          <path d={paper} />
        </clipPath>
        {hasFold && (
          <>
            <linearGradient id={faceBr} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={foldTip} />
              <stop offset="1" stopColor={foldCrease} />
            </linearGradient>
            <linearGradient id={faceBl} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={foldTip} />
              <stop offset="1" stopColor={foldCrease} />
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
      </>
    ),
    body: (
      <>
        {/* paper, then content clipped to the (corner-cut) paper shape */}
        <path d={paper} fill={paperFill} />
        <g clipPath={`url(#${clipId})`}>
          {content.elements.map(renderElement)}
        </g>

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
      </>
    ),
  };
}

const fastenerIdsFor = (uid: string): FastenerIds => ({
  grad: `${uid}-fastener-grad`,
  blur: `${uid}-fastener-blur`,
});

export function NoteRender({ content }: { content: NoteContent }) {
  const uid = useId();
  const fastenerIds = fastenerIdsFor(uid);
  const paper = paperLayers(uid, content);

  return (
    <svg
      viewBox={`0 ${-FASTENER_MARGIN} ${CANVAS} ${CANVAS + FASTENER_MARGIN}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="sticky note"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {paper.defs}
        {fastenerDefs(content.fastener, fastenerIds)}
      </defs>

      {/* sticky tack sits behind the note, peeking out above the top edge */}
      {fastenerBehind(content.fastener, fastenerIds)}
      {paper.body}
      {/* fastener on top of everything */}
      {fastenerFront(content.fastener, fastenerIds)}
    </svg>
  );
}

// The sheet on its own, no fastener and no board headroom — what the editor's
// cutting mat shows while a note is being drawn. Same paper code as the wall,
// so what you draw is what gets pinned up.
export function NotePaper({ content }: { content: NoteContent }) {
  const uid = useId();
  const paper = paperLayers(uid, content);
  return (
    <svg
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="sticky note"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>{paper.defs}</defs>
      {paper.body}
    </svg>
  );
}

// A fastener as applied, on a strip of the note's top edge — the fastener
// drawer's swatch. Same drawing functions as the wall, so what the drawer shows
// is exactly what lands on the board.
export function FastenerPreview({
  fastener,
  colour = "yellow",
}: {
  fastener: Fastener;
  colour?: PaperColour;
}) {
  const uid = useId();
  const ids = fastenerIdsFor(uid);
  return (
    <svg
      viewBox={`0 ${-FASTENER_MARGIN} ${CANVAS} ${CANVAS * 0.2 + FASTENER_MARGIN}`}
      width="100%"
      height="100%"
      // decorative: the drawer's own control carries the name of the fastener
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>{fastenerDefs(fastener, ids)}</defs>
      {fastenerBehind(fastener, ids)}
      {/* the top strip of a note: board above y = 0, paper below */}
      <rect
        x={0}
        y={0}
        width={CANVAS}
        height={CANVAS * 0.2}
        fill={PAPER[colour]}
      />
      {fastenerFront(fastener, ids)}
    </svg>
  );
}
