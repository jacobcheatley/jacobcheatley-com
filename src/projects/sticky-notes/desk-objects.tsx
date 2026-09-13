import type { CSSProperties, ReactNode, Ref } from "react";
import { EASE_OUT, STILL } from "./desk";
import { FONT_FAMILIES } from "./note-fonts";
import { INK, PAPER } from "./note-render";
import {
  FONTS,
  type Font,
  type Ink,
  PAPER_COLOURS,
  type PaperColour,
} from "./note-schema";
import { SHEET_MS } from "./StickerSheet";

// The things lying on the cutting mat, drawn: the pad stack's sheets, the
// markers, the eraser, the draw/write rocker and the bin. Props in, CSS out —
// no model, no pointer handling, no state of their own. StickyEditor owns all
// of that and wears these.

export const PAD = 48; // a pad's size — a thumb target, per the T0 verdict (#70)
export const FAN_MS = 250;
const FAN_STEP = 46; // fanned spacing: each pad keeps a ≥44px-wide target
const FAN_LIFT = 76; // how far the fan rises off the strip
const MID = (PAPER_COLOURS.length - 1) / 2;

const LIFT_MS = 220; // cap off, body lifts — the bit #70 liked most

// Tool sizes. The strip is ONE row at every width (#74), so nothing on it may
// wrap, grow or shrink: each object lies in a box of a fixed size, and every
// lift, tilt and cap-off inside that box is a transform, which cannot move its
// neighbours. A marker's box is only as wide as the marker (they sit shoulder
// to shoulder on a phone); its 88px height is what keeps it a thumb target.
const TOUCH = 48;
const MARKER_W = 30; // drawn width — the T0 verdict (#70) wanted fatter objects, not just fatter targets
const MARKER_H = 72;
const TOOL_H = 88;
const ERASER_W = 40;
const ERASER_H = 28;
// The rocker stands upright — squiggle over Aa — so it costs one thumb target
// of width beside the four markers instead of two.
const ROCKER_W = TOUCH;
const ROCKER_H = TOUCH;
const FONT_CHIP = TOUCH;
// The sticker tab: drawn as a sheet corner, and its own target.
const STICKER_TAB_W = 40;
const STICKER_TAB_H = 44;
const BIN_W = TOUCH;
const BIN_H = 56;

// The space between the objects in a group: whatever room the screen has left,
// and none at all on a narrow phone. The markers "really don't need spacing"
// (owner, #74) — closing up is what keeps the strip one row.
export const DESK_GAP = "clamp(0px, 1.5vw - 5px, 12px)";
// Past zero the four markers lean on each other rather than wrap. ponytail: 4px
// a side is the ceiling — 8px of overlap between neighbours, which is where a
// 30px marker still reads as a separate pen. If a narrower phone than 320
// turns up, take the width off the bin and the pad stack, not off this.
const SQUEEZE = "clamp(-4px, (100vw - 420px) / 25, 0px)";

// The fixed boxes the strip's objects lie in.
export const MARKER_SLOT: CSSProperties = {
  width: MARKER_W,
  height: TOOL_H,
  marginInline: SQUEEZE,
};
export const ERASER_SLOT: CSSProperties = { width: ERASER_W, height: TOOL_H };
export const TAB_SLOT: CSSProperties = { width: STICKER_TAB_W, height: TOUCH };

// How long the held tool shakes when the note is full and nothing more fits.
export const SHAKE_MS = 200;

// The draw/write control with nothing in your hand: inert stationery grey.
const GREY = "#8a8371";

// Where the pointer sits inside the tool image that rides a mouse: the marker's
// nib tip, the eraser's rubbing corner.
const MARKER_HOTSPOT: [number, number] = [MARKER_W / 2, MARKER_H + 8];
const ERASER_HOTSPOT: [number, number] = [5, ERASER_H - 3];

export type Mode = "draw" | "write";

// A tool lying in its slot on the mat: the object plus the shadow that IS the
// slot. The whole slot is the target, and its box is fixed (`slot`) — the tool
// inside it lifts and tilts by transform only, so picking up or using one tool
// can never shift the object beside it (#74).
export function ToolSlot({
  label,
  held,
  shake = false,
  slot,
  onClick,
  children,
}: {
  label: string;
  held: boolean;
  // the note is full: rock the tool so the dead pointer-down says something
  shake?: boolean;
  // the fixed box this tool lies in, from the sizes above
  slot: CSSProperties;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      onClick={onClick}
      className="relative flex shrink-0 items-end justify-center border-0 bg-transparent p-0 motion-reduce:animate-none!"
      style={{
        ...slot,
        animation: shake ? `desk-shake ${SHAKE_MS}ms ease-in-out` : undefined,
      }}
    >
      <span
        aria-hidden="true"
        className={`-translate-x-1/2 pointer-events-none absolute bottom-px left-1/2 block rounded-[50%] ${STILL}`}
        style={{
          width: 28,
          height: 7,
          background: "rgba(0,0,0,.45)",
          filter: "blur(2.5px)",
          transform: held ? "translateX(-50%) scale(1.3)" : "translateX(-50%)",
          opacity: held ? 0.55 : 1,
          transition: `transform 260ms ${EASE_OUT}, opacity 260ms`,
        }}
      />
      {children}
    </button>
  );
}

// A capped marker. Picked up, the cap twists off and drops beside the slot while
// the body lifts; mid-stroke it leans further (the coarse-pointer stand-in for
// a tool riding the cursor).
export function MarkerBody({
  ink,
  held = false,
  using = false,
  loose = false,
}: {
  ink: Ink;
  held?: boolean;
  using?: boolean;
  // already in your hand (the image riding the cursor): no cap, no dock lift
  loose?: boolean;
}) {
  const c = INK[ink];
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none relative block"
      style={{ width: MARKER_W, height: MARKER_H }}
    >
      <span
        className={`absolute inset-0 block ${STILL}`}
        style={{
          borderRadius: "4px 4px 3px 3px",
          backgroundColor: c,
          backgroundImage:
            "linear-gradient(100deg, rgba(255,255,255,.34) 0 20%, rgba(255,255,255,0) 20% 60%, rgba(0,0,0,.18) 60%)",
          boxShadow: "0 3px 6px rgba(0,0,0,.45)",
          transform:
            loose || !held
              ? "none"
              : using
                ? "translateY(-27px) rotate(-16deg)"
                : "translateY(-17px) rotate(-7deg)",
          transition: `transform ${LIFT_MS}ms ${EASE_OUT}`,
        }}
      >
        {/* grip band */}
        <span
          className="absolute right-0 left-0 block"
          style={{
            top: 26,
            height: 11,
            background: "rgba(0,0,0,.22)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.12)",
          }}
        />
        {/* nib */}
        <span
          className="absolute block"
          style={{
            bottom: -8,
            left: MARKER_W / 2 - 5,
            width: 10,
            height: 9,
            backgroundColor: c,
            filter: "brightness(.62)",
            clipPath: "polygon(0 0, 100% 0, 66% 100%, 34% 100%)",
          }}
        />
      </span>
      {!loose && (
        <span
          className={`absolute block ${STILL}`}
          style={{
            left: -1,
            bottom: -10,
            width: MARKER_W + 2,
            height: 26,
            borderRadius: "2px 2px 4px 4px",
            borderTop: "2px solid rgba(255,255,255,.35)",
            backgroundColor: c,
            backgroundImage:
              "linear-gradient(100deg, rgba(255,255,255,.45) 0 26%, rgba(0,0,0,.18) 72%)",
            filter: "brightness(1.12) saturate(.9)",
            boxShadow:
              "0 2px 4px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.35)",
            transform: held ? "translate(12px, 16px) rotate(74deg)" : "none",
            transition: `transform ${LIFT_MS + 60}ms ${EASE_OUT}`,
          }}
        />
      )}
    </span>
  );
}

// A block eraser: cream rubber with a purple band. It lifts only when it is the
// thing in your hand — `using` is the editor's "a tool is working" flag, and
// reading it on its own is what made the eraser rise every time a marker drew
// a stroke (#74). MarkerBody has always gated it on `held`; this now matches.
export function EraserBody({
  held = false,
  using = false,
}: {
  held?: boolean;
  using?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-object="eraser"
      className={`pointer-events-none relative block ${STILL}`}
      style={{
        width: ERASER_W,
        height: ERASER_H,
        borderRadius: 3,
        background: "linear-gradient(180deg,#fbf6ee,#dbd0bf)",
        boxShadow: "0 3px 6px rgba(0,0,0,.45), inset 0 -4px 0 rgba(0,0,0,.07)",
        transform: !held
          ? "none"
          : using
            ? "translateY(-26px) rotate(-13deg)"
            : "translateY(-17px) rotate(-6deg)",
        transition: `transform ${LIFT_MS}ms ${EASE_OUT}`,
      }}
    >
      <span
        className="absolute right-0 left-0 block"
        style={{
          top: 8,
          height: 10,
          background: "linear-gradient(180deg,#cdbde9,#b7a4d8)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)",
        }}
      />
    </span>
  );
}

// The tool in your hand, as the image that rides a fine pointer: where the
// pointer sits inside it, the tilt around that point, and the object itself.
export function heldTool(held: Ink | "eraser"): {
  hotspot: [number, number];
  style: CSSProperties;
  body: ReactNode;
} {
  const eraser = held === "eraser";
  const hotspot = eraser ? ERASER_HOTSPOT : MARKER_HOTSPOT;
  return {
    hotspot,
    style: {
      transform: eraser ? "rotate(-22deg)" : "rotate(-28deg)",
      transformOrigin: hotspot.map((n) => `${n}px`).join(" "),
    },
    body: eraser ? <EraserBody /> : <MarkerBody ink={held} loose />,
  };
}

// Draw or write with the marker in your hand: one rocker, tinted with that
// marker's ink so it reads as part of it, inert and grey with an empty hand.
// The "Aa" side opens the four font samples, each in its own face.
export function ModeControl({
  ink,
  mode,
  font,
  fontsOpen,
  onMode,
  onFont,
}: {
  ink: Ink | null;
  mode: Mode;
  font: Font;
  // the samples are a pop-up over the mat, not a fifth object on the strip
  fontsOpen: boolean;
  onMode: (m: Mode) => void;
  onFont: (f: Font) => void;
}) {
  const tint = ink ? INK[ink] : GREY;
  const half = (m: Mode, label: string, glyph: ReactNode): ReactNode => {
    const on = mode === m;
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        disabled={!ink}
        onClick={() => onMode(m)}
        className={`relative flex min-h-12 min-w-12 shrink-0 items-center justify-center border-0 border-slate-900/15 border-t p-0 first:border-t-0 disabled:opacity-70 ${STILL}`}
        style={{
          width: ROCKER_W,
          height: ROCKER_H,
          color: tint,
          opacity: on ? 1 : 0.55,
          background: on ? "rgba(0,0,0,.10)" : "transparent",
          transform: on ? "translateY(2px)" : "none",
          transition: `transform 200ms ${EASE_OUT}, background 200ms, opacity 200ms`,
        }}
      >
        {glyph}
        {on && (
          <span
            aria-hidden="true"
            className="absolute bottom-[3px] block h-[3px] w-5 rounded-sm opacity-75"
            style={{ background: "currentColor" }}
          />
        )}
      </button>
    );
  };

  return (
    <div className="relative shrink-0">
      <div
        className="flex flex-col items-stretch overflow-hidden rounded-[5px]"
        style={{
          background: "linear-gradient(180deg,#f6efe2,#ddd2bd)",
          boxShadow:
            "0 4px 7px rgba(0,0,0,.42), inset 0 -3px 0 rgba(0,0,0,.09)",
        }}
      >
        {half(
          "draw",
          "Draw with the marker",
          <svg
            width="23"
            height="16"
            viewBox="0 0 24 16"
            aria-hidden="true"
            focusable="false"
          >
            <title>squiggle</title>
            <path
              d="M2 11 Q6 1 10 8 T18 6 Q21 5 22 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>,
        )}
        {half(
          "write",
          "Write with the marker",
          <span
            aria-hidden="true"
            style={{
              fontFamily: FONT_FAMILIES[font],
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            Aa
          </span>,
        )}
      </div>

      {/* the samples ARE the choice: each label in its own face. Hung off the
          rocker's right edge, not centred on it: centred, the row runs off a
          320px strip, since the rocker sits at the strip's right end. */}
      {ink && fontsOpen && (
        <div className="absolute right-0 bottom-[calc(100%+10px)] z-30 flex gap-1.5">
          {FONTS.map((f) => (
            <button
              key={f}
              type="button"
              aria-label={`Write in ${f}`}
              aria-pressed={f === font}
              onClick={() => onFont(f)}
              className={`flex items-center justify-center rounded-[2px] border-0 p-0 ${STILL}`}
              style={{
                width: FONT_CHIP,
                height: FONT_CHIP,
                fontFamily: FONT_FAMILIES[f],
                fontSize: 20,
                lineHeight: 1,
                color: tint,
                background: "linear-gradient(180deg,#fffdf6,#ece3cf)",
                boxShadow:
                  f === font
                    ? `0 3px 5px rgba(0,0,0,.4), inset 0 0 0 2px ${tint}`
                    : "0 3px 5px rgba(0,0,0,.4)",
                transform: f === font ? "translateY(-3px)" : "none",
                transition: `transform 160ms ${EASE_OUT}`,
              }}
            >
              Aa
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Resting, the pads sit as one compact pile; fanned, they lie in a shallow arc
// with every colour a thumb's width of its own (the T0 slivers were unhittable).
export function padStyle(
  i: number,
  colour: PaperColour,
  fanned: boolean,
  active: boolean,
): CSSProperties {
  const transform = fanned
    ? `translate(${i * FAN_STEP}px, ${-FAN_LIFT + Math.abs(i - MID) * 4}px) rotate(${(i - MID) * 4}deg)`
    : `translate(${i * 2}px, ${i * -1.5}px) rotate(${(i - MID) * 1.2}deg)`;
  return {
    width: PAD,
    height: PAD,
    transform,
    // The note's own colour tops the resting pile, the way the pad you are
    // working from ends up on top of a real desk. Fanned, the arc keeps
    // PAPER_COLOURS order.
    zIndex: active && !fanned ? 10 + PAPER_COLOURS.length : 10 + i,
    transition: `transform ${FAN_MS}ms ${EASE_OUT}, box-shadow ${FAN_MS}ms`,
    backgroundColor: PAPER[colour],
    backgroundImage:
      "linear-gradient(170deg, rgba(255,255,255,.4), rgba(255,255,255,0) 45%)",
    boxShadow: active
      ? "0 7px 11px rgba(0,0,0,.5), inset 0 -2px 0 rgba(0,0,0,.08)"
      : "0 3px 6px rgba(0,0,0,.4), inset 0 -2px 0 rgba(0,0,0,.08)",
  };
}

// The bin at the right end of the strip: a tapered steel basket. Inert with no
// note on the mat — there is nothing to throw away.
export function Bin({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Bin this note"
      data-slot="bin"
      onClick={onClick}
      disabled={disabled}
      className="relative flex shrink-0 items-end justify-center border-0 bg-transparent p-0 disabled:opacity-45"
      style={{ width: BIN_W, height: BIN_H }}
    >
      <span
        className="absolute right-1.5 bottom-[46px] left-1.5 block h-1.5 rounded-sm"
        style={{
          background: "linear-gradient(180deg,#b4bec9,#6d7683)",
          boxShadow: "0 1px 2px rgba(0,0,0,.45)",
        }}
      />
      <span
        className="relative block h-12 w-11"
        style={{
          background: "linear-gradient(100deg,#98a3b0,#5a636e)",
          clipPath: "polygon(7% 0, 93% 0, 81% 100%, 19% 100%)",
          boxShadow: "0 5px 8px rgba(0,0,0,.5)",
        }}
      >
        <span
          className="absolute inset-x-1 top-2 bottom-1 block"
          style={{
            background:
              "repeating-linear-gradient(96deg, rgba(0,0,0,.3) 0 1px, transparent 1px 8px)",
          }}
        />
      </span>
    </button>
  );
}

// The sticker sheet's tab (#75): the corner of a sheet of stickers peeking over
// the mat's bottom edge. Open, it rides up with the sheet and perches on its
// top-right corner, so it is still the thing you tap to put the sheet away.
export function StickerTab({
  open,
  lift,
  onClick,
  ref,
}: {
  open: boolean;
  // how far up the sheet's corner is, measured by whoever knows the strip
  lift: number;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${open ? "Close" : "Open"} the sticker sheet`}
      aria-expanded={open}
      onClick={onClick}
      className={`relative flex shrink-0 items-end justify-center border-0 bg-transparent p-0 ${STILL}`}
      style={{
        ...TAB_SLOT,
        transform: lift ? `translateY(${-lift}px)` : "none",
        transition: `transform ${SHEET_MS}ms ${EASE_OUT}`,
      }}
    >
      <span
        aria-hidden="true"
        className="relative flex items-start justify-center"
        style={{
          width: STICKER_TAB_W,
          height: STICKER_TAB_H,
          paddingTop: 7,
          borderRadius: "4px 4px 1px 1px",
          fontSize: 17,
          lineHeight: 1,
          background: "linear-gradient(180deg,#ffffff,#ece8de)",
          boxShadow: "0 -2px 8px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.3)",
        }}
      >
        ⭐{/* the dog-eared corner that says "peel me" */}
        <span
          className="absolute top-0 right-0 block"
          style={{
            borderWidth: "0 9px 9px 0",
            borderStyle: "solid",
            borderColor: "transparent #cfcabd transparent transparent",
          }}
        />
      </span>
    </button>
  );
}
