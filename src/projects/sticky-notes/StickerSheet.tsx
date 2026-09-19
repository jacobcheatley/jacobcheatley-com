import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { capturePointer, EASE_OUT, SHEET_MS, STILL } from "./desk";
import { TRAY_PAD } from "./desk-objects";
import { STICKER_EMOJI } from "./note-schema";

type StickerEmoji = (typeof STICKER_EMOJI)[number];

const CELL = 48; // a thumb target
const GAP = 4;
const COLS = 6;
const PAD_X = 12;
const HANDLE_H = 44; // the grab strip, a thumb tall
const ROWS = Math.ceil(STICKER_EMOJI.length / COLS);
const CORNER = 44; // the folded corner's target, a thumb like the cells
const DOG_EAR = 28; // the fold as it is drawn, inside that target

const SHEET_W = COLS * CELL + (COLS - 1) * GAP + PAD_X * 2;
// How tall the sheet stands off the mat's bottom edge; the editor keeps the
// note above this line.
// ponytail: this restates the layout below by hand, so a padding added to the
// sheet and not here floats the note; measure with a ResizeObserver instead.
export const SHEET_H = `calc(${HANDLE_H + ROWS * CELL + (ROWS - 1) * GAP}px + ${TRAY_PAD})`;

const SWIPE = 40; // how far down the handle travels before the sheet drops
const BACK_MS = 250; // a missed sticker's flight home

// The printed backing: the same glyph in one flat grey, a hair down-right, so
// every sticker reads as die-cut off a sheet. A quarter bigger than the sticker
// over it, or the emoji covers it at a 1px offset and no rim shows.
const SILHOUETTE: CSSProperties = {
  color: "transparent",
  WebkitTextFillColor: "transparent",
  textShadow: "1px 1px 0 #cbd5e1",
  transform: "translate(1px, 1px) scale(1.25)",
};

// Client coordinates: the editor maps them onto the note, so the sheet never
// learns where the paper is.
type Flight = {
  pointerId: number;
  emoji: StickerEmoji;
  index: number;
  x: number;
  y: number;
  home: { x: number; y: number };
  back: boolean;
};

export function StickerSheet({
  open,
  canPeel,
  onDrop,
  onClose,
}: {
  open: boolean;
  canPeel: boolean;
  // true when the sticker landed on the note; false sends it back to its cell.
  onDrop: (emoji: StickerEmoji, clientX: number, clientY: number) => boolean;
  onClose: () => void;
}) {
  const [flight, setFlight] = useState<Flight | null>(null);
  const backTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const swipeFrom = useRef<number | null>(null);

  useEffect(() => () => clearTimeout(backTimer.current), []);
  // The tab that opened the sheet is inert under it now, so focus lands on the
  // corner instead. Without scrolling: the corner is still below the mat's edge
  // as the sheet rises, and nothing ever undoes a scroll of its hidden overflow.
  const corner = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) corner.current?.focus({ preventScroll: true });
  }, [open]);

  // ponytail: the pointer's position is state, so every move re-renders 24
  // spans; move `x`/`y` onto the flying node if a low-end phone says otherwise.
  function peel(
    e: ReactPointerEvent<HTMLButtonElement>,
    emoji: StickerEmoji,
    index: number,
  ) {
    e.preventDefault();
    if (!canPeel || flight) return;
    const r = e.currentTarget.getBoundingClientRect();
    capturePointer(e);
    setFlight({
      pointerId: e.pointerId,
      emoji,
      index,
      x: e.clientX,
      y: e.clientY,
      home: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      back: false,
    });
  }

  function carry(e: ReactPointerEvent) {
    if (!flight || e.pointerId !== flight.pointerId || flight.back) return;
    setFlight({ ...flight, x: e.clientX, y: e.clientY });
  }

  function release(e: ReactPointerEvent) {
    if (!flight || e.pointerId !== flight.pointerId || flight.back) return;
    // A cancelled pointer is a miss, not a drop at wherever it died.
    const landed =
      e.type !== "pointercancel" && onDrop(flight.emoji, e.clientX, e.clientY);
    if (landed) {
      setFlight(null); // the sheet is infinite: the cell fills back in
      return;
    }
    setFlight({ ...flight, back: true });
    backTimer.current = setTimeout(() => setFlight(null), BACK_MS);
  }

  function grab(e: ReactPointerEvent<HTMLDivElement>) {
    swipeFrom.current = e.clientY;
    capturePointer(e);
  }

  function swipe(e: ReactPointerEvent<HTMLDivElement>) {
    if (swipeFrom.current === null || e.clientY - swipeFrom.current < SWIPE)
      return;
    swipeFrom.current = null;
    onClose();
  }

  return (
    <>
      <div
        data-slot="sheet"
        // Closed, it is parked below the mat's edge: `inert` takes the whole
        // sheet out of the tab order, the screen-reader tree and the pointer's
        // way in one go.
        inert={!open}
        // z-50: over the tray (z-40), which it covers while it is up.
        className={`${STILL} absolute inset-x-0 z-50 mx-auto`}
        style={{
          bottom: 0,
          width: `min(${SHEET_W}px, 100vw)`,
          paddingLeft: PAD_X,
          paddingRight: PAD_X,
          paddingBottom: TRAY_PAD,
          background: "linear-gradient(180deg,#ffffff,#f7f4ea)",
          borderRadius: "10px 10px 0 0",
          boxShadow:
            "0 -10px 24px rgba(0,0,0,.45), inset 0 0 0 1px rgba(0,0,0,.06)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${SHEET_MS}ms ${EASE_OUT}`,
        }}
      >
        <div
          data-slot="sheet-handle"
          className="flex touch-none items-center justify-center"
          style={{ height: HANDLE_H, cursor: "grab" }}
          onPointerDown={grab}
          onPointerMove={swipe}
          onPointerUp={() => {
            swipeFrom.current = null;
          }}
          onPointerCancel={() => {
            swipeFrom.current = null;
          }}
        >
          <span
            aria-hidden="true"
            className="block h-1 w-11 rounded-sm"
            style={{ background: "rgba(0,0,0,.16)" }}
          />
        </div>

        {/* Drawn only while the sheet is up: an away sheet has nothing to
            close. */}
        {open && (
          <button
            ref={corner}
            type="button"
            aria-label="Close the sticker sheet"
            onClick={onClose}
            className="absolute top-0 right-0 cursor-pointer border-0 bg-transparent p-0"
            style={{ width: CORNER, height: CORNER }}
          >
            <span
              aria-hidden="true"
              className="absolute top-0 right-0 block"
              style={{
                width: DOG_EAR,
                height: DOG_EAR,
                // 225deg runs to the bottom left, so the filled half is the
                // top-right triangle: the folded flap.
                background:
                  "linear-gradient(225deg,#e3dcc8 0 50%,transparent 50%)",
                borderTopRightRadius: 10,
                filter: "drop-shadow(-2px 2px 2px rgba(0,0,0,.3))",
              }}
            />
          </button>
        )}

        <div
          className="grid justify-center"
          style={{
            gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
            gap: GAP,
          }}
        >
          {STICKER_EMOJI.map((emoji, i) => (
            <button
              key={emoji}
              type="button"
              // Pointer-only: a sticker is placed by dragging it onto the note,
              // so a focusable cell would be one that does nothing on Enter.
              // The label stays for touch exploration and for reading the page.
              tabIndex={-1}
              aria-label={`Peel the ${emoji} sticker`}
              data-peeled={flight?.index === i ? "" : undefined}
              onPointerDown={(e) => peel(e, emoji, i)}
              onPointerMove={carry}
              onPointerUp={release}
              onPointerCancel={release}
              className="relative flex touch-none items-center justify-center border-0 bg-transparent p-0"
              style={{ width: CELL, height: CELL, fontSize: 26, lineHeight: 1 }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={SILHOUETTE}
              >
                {emoji}
              </span>
              <span
                aria-hidden="true"
                className={`pointer-events-none relative ${STILL}`}
                style={{
                  opacity: flight?.index === i ? 0 : 1,
                  transition: "opacity 120ms",
                }}
              >
                {emoji}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* A sibling of the sheet, not a child: the sheet's transform would be
          the containing block for anything fixed inside it. */}
      {flight && (
        <div
          aria-hidden="true"
          className={`${STILL} pointer-events-none fixed top-0 left-0 z-50`}
          style={{
            fontSize: 34,
            lineHeight: 1,
            filter: "drop-shadow(0 5px 5px rgba(0,0,0,.35))",
            transform: flight.back
              ? `translate(${flight.home.x - 17}px, ${flight.home.y - 17}px) scale(.75)`
              : `translate(${flight.x - 17}px, ${flight.y - 17}px) rotate(-9deg)`,
            opacity: flight.back ? 0 : 1,
            transition: flight.back
              ? `transform ${BACK_MS}ms ${EASE_OUT}, opacity ${BACK_MS}ms`
              : undefined,
          }}
        >
          {flight.emoji}
        </div>
      )}
    </>
  );
}
