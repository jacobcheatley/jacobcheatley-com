import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { EASE_OUT, STILL } from "./desk";
import { STICKER_EMOJI } from "./note-schema";

// The sticker sheet (#75): a pull-up sheet of printed stickers that the visitor
// peels one off and drags onto the note. It owns the peel gesture and nothing
// else — where a sticker lands is the editor's business (`onDrop`), which keeps
// the note, the held tool and the open text draft out of this file entirely.
//
// The sheet is sized to its 24 stickers, never to a fraction of the viewport
// (the T0 verdict, #70): six 48px cells across, four rows down.

type StickerEmoji = (typeof STICKER_EMOJI)[number];

export const SHEET_MS = 500;

const CELL = 48; // a thumb target, like every other object on the desk
const GAP = 4;
const COLS = 6;
const PAD_X = 12;
const PAD_B = 12;
const HANDLE_H = 26;
const ROWS = Math.ceil(STICKER_EMOJI.length / COLS);

export const SHEET_W = COLS * CELL + (COLS - 1) * GAP + PAD_X * 2;
// ponytail: the height is the cell maths, not a measurement — so a phone whose
// safe-area inset is deeper than PAD_B makes the real sheet a touch taller than
// this. Measure it (a ref + ResizeObserver) if that gap ever shows.
export const SHEET_H = HANDLE_H + ROWS * CELL + (ROWS - 1) * GAP + PAD_B;
// The tab rides up with the sheet and perches on its top-right corner, clear of
// the grid — otherwise, on a phone narrow enough for the sheet to reach the
// mat's right edge, it would cover a sticker. This is how far its bottom edge
// ends up BELOW the sheet's top edge, so it overlaps like a real tab; how far
// that is from where the tab rests is the editor's measurement, since the strip
// decides where it rests.
export const TAB_PERCH = 10;

const SWIPE = 40; // how far down the handle travels before the sheet drops
const BACK_MS = 250; // a missed sticker's flight home

// The printed backing: the same glyph in ONE flat grey, a hair down-right, so
// every sticker reads as die-cut off a sheet. The shadow paints the glyph's
// alpha in a single value — a greyscale of the emoji was the thing the T0
// verdict rejected (#70). It is printed a quarter bigger than the sticker over
// it: at a 1px offset alone the emoji covers it completely (measured in
// Chrome), and a rim all the way round is what reads as printing rather than a
// drop shadow.
const SILHOUETTE: CSSProperties = {
  color: "transparent",
  WebkitTextFillColor: "transparent",
  textShadow: "1px 1px 0 #cbd5e1",
  transform: "translate(1px, 1px) scale(1.25)",
};

// One sticker off the sheet and under the pointer. Client coordinates: the
// editor maps them onto the note, so the sheet never learns where the paper is.
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
  // A full note (or a bare mat) lifts nothing: a refused peel is silent.
  canPeel: boolean;
  // true when the sticker landed on the note; false sends it back to its cell.
  onDrop: (emoji: StickerEmoji, clientX: number, clientY: number) => boolean;
  onClose: () => void;
}) {
  const [flight, setFlight] = useState<Flight | null>(null);
  const backTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const swipeFrom = useRef<number | null>(null);

  useEffect(() => () => clearTimeout(backTimer.current), []);

  // ponytail: the pointer's position is state, so every move re-renders 24
  // spans. That is nothing next to the live stroke the editor drives with refs;
  // if a low-end phone ever says otherwise, move `x`/`y` onto the flying node.
  function peel(
    e: ReactPointerEvent<HTMLButtonElement>,
    emoji: StickerEmoji,
    index: number,
  ) {
    e.preventDefault();
    if (!canPeel || flight) return; // one peel at a time
    const r = e.currentTarget.getBoundingClientRect();
    // Keep the sticker with this pointer wherever it wanders. The guard is for
    // jsdom (no pointer capture) and for a stale pointer id, which throws.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // not a live pointer — carry on without capture
    }
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

  // The handle is a grab strip: drag it down far enough and the sheet drops.
  function grab(e: ReactPointerEvent<HTMLDivElement>) {
    swipeFrom.current = e.clientY;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // not a live pointer — carry on without capture
    }
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
        // Closed, it is parked below the mat's edge: out of the pointer's way
        // and out of the screen-reader tree.
        aria-hidden={!open}
        className={`${STILL} absolute inset-x-0 bottom-0 z-40 mx-auto`}
        style={{
          width: `min(${SHEET_W}px, 100vw)`,
          paddingLeft: PAD_X,
          paddingRight: PAD_X,
          paddingBottom: `max(${PAD_B}px, env(safe-area-inset-bottom))`,
          background: "linear-gradient(180deg,#ffffff,#f7f4ea)",
          borderRadius: "10px 10px 0 0",
          boxShadow:
            "0 -10px 24px rgba(0,0,0,.45), inset 0 0 0 1px rgba(0,0,0,.06)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${SHEET_MS}ms ${EASE_OUT}`,
          pointerEvents: open ? undefined : "none",
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

      {/* The peeled sticker, under the pointer. A sibling of the sheet, not a
          child: the sheet's transform would be the containing block for
          anything fixed inside it. */}
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
