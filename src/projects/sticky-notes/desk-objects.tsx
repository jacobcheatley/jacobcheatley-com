import { type CSSProperties, type ReactNode, type Ref, useId } from "react";
import { EASE_OUT, STILL, TAPE } from "./desk";
import { FONT_FAMILIES } from "./note-fonts";
import { INK, PAPER } from "./note-render";
import {
  FONTS,
  type Font,
  type Ink,
  PAPER_COLOURS,
  type PaperColour,
} from "./note-schema";

// The things lying on the cutting mat, drawn: the pads on the chooser, the
// hand, the markers, the eraser, the draw/write rocker, the bin and its slip. Props in,
// CSS out — no model, no pointer handling, no state of their own. StickyEditor
// owns all of that and wears these.

// The sheet's side on the mat, and so each pad's on the chooser: a pad is the
// note's real size (#81). `svh` is the height with a phone browser's toolbars
// showing: `vh` counts them hidden, and the stack, which fits to the chooser's
// real height, would lose its last pad under them.
export const PAPER_SIDE = "min(88vw, 60svh)";
const CHOOSER_MS = 400; // the pads left behind sliding away, or back

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
const HAND_W = 40;
const HAND_H = 50;
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
// turns up, take the width off the bin and the sticker tab, not off this.
const SQUEEZE = "clamp(-4px, (100vw - 420px) / 25, 0px)";

// The fixed boxes the strip's objects lie in.
export const MARKER_SLOT: CSSProperties = {
  width: MARKER_W,
  height: TOOL_H,
  marginInline: SQUEEZE,
};
export const ERASER_SLOT: CSSProperties = { width: ERASER_W, height: TOOL_H };
export const HAND_SLOT: CSSProperties = { width: HAND_W, height: TOOL_H };

// The tray's lip under the objects, clear of a phone's home indicator.
export const TRAY_PAD = "max(0.75rem, env(safe-area-inset-bottom))";
// How high the tray stands off the mat's bottom edge: the rocker (two thumb
// targets, squiggle over Aa) is the tallest thing in it. The sticker sheet
// sits on this line (#82), so it never covers the tray.
export const TRAY_TOP = `calc(${2 * ROCKER_H}px + ${TRAY_PAD})`;
// The room before the bin: up to 32px from the eraser on a wide screen, down to
// the row's own gap on a phone. The spacer takes back the row gap on its far
// side, so the gaps either side of it don't count twice; a shrinkable flex
// item, it gives up its width before anything else has to.
export const BIN_SPACER: CSSProperties = {
  width: `clamp(0px, 4vw, 32px - ${DESK_GAP})`,
  marginInlineEnd: `calc(-1 * ${DESK_GAP})`,
};
export const TAB_SLOT: CSSProperties = { width: STICKER_TAB_W, height: TOUCH };

// How long the held tool shakes when the note is full and nothing more fits.
export const SHAKE_MS = 200;

// The draw/write control with no marker in hand: inert stationery grey.
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
      // z-10: where a tool's box meets its neighbour's on a narrow strip, the
      // tool is the thing under the finger.
      className="relative z-10 flex shrink-0 items-end justify-center border-0 bg-transparent p-0 motion-reduce:animate-none!"
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

// The hand (#82): an open-hand cut-out lying in the tray, for holding nothing
// but the note itself. It lifts like the eraser when it is the one held, and
// further while it turns or peels the note.
export function HandBody({
  held = false,
  using = false,
}: {
  held?: boolean;
  using?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-object="hand"
      width={HAND_W}
      height={HAND_H}
      viewBox={`0 0 ${HAND_W} ${HAND_H}`}
      // One fill for every part, so the shadow falls from the whole outline.
      className={`pointer-events-none block ${STILL}`}
      style={{
        fill: "#e9dfcd",
        filter: "drop-shadow(0 3px 3px rgba(0,0,0,.45))",
        transform: !held
          ? "none"
          : using
            ? "translateY(-26px) rotate(-13deg)"
            : "translateY(-17px) rotate(-6deg)",
        transition: `transform ${LIFT_MS}ms ${EASE_OUT}`,
      }}
    >
      <title>hand</title>
      <rect x="9" y="20" width="26" height="30" rx="9" />
      <rect x="9" y="6" width="5.5" height="24" rx="2.75" />
      <rect x="15.5" y="2" width="5.5" height="26" rx="2.75" />
      <rect x="22" y="4" width="5.5" height="24" rx="2.75" />
      <rect x="28.5" y="10" width="5.5" height="20" rx="2.75" />
      {/* the thumb, splayed out from the heel of the palm */}
      <rect
        x="4"
        y="22"
        width="6"
        height="20"
        rx="3"
        transform="rotate(-32 10 42)"
      />
    </svg>
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

// One font sample: the name of the face, written in it, on a chip of card.
export function FontChip({
  font,
  active,
  tint,
  onPick,
}: {
  font: Font;
  active: boolean;
  // the ink it would be written in, so the sample shows the real thing
  tint: string;
  onPick: (f: Font) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Write in ${font}`}
      aria-pressed={active}
      onClick={() => onPick(font)}
      className={`flex shrink-0 items-center justify-center rounded-[2px] border-0 p-0 ${STILL}`}
      style={{
        width: FONT_CHIP,
        height: FONT_CHIP,
        fontFamily: FONT_FAMILIES[font],
        fontSize: 20,
        lineHeight: 1,
        color: tint,
        background: "linear-gradient(180deg,#fffdf6,#ece3cf)",
        boxShadow: active
          ? `0 3px 5px rgba(0,0,0,.4), inset 0 0 0 2px ${tint}`
          : "0 3px 5px rgba(0,0,0,.4)",
        transform: active ? "translateY(-3px)" : "none",
        transition: `transform 160ms ${EASE_OUT}`,
      }}
    >
      Aa
    </button>
  );
}

// Draw or write with the marker in your hand: one rocker, tinted with that
// marker's ink so it reads as part of it, inert and grey while the hand or the
// eraser is held.
// The "Aa" side opens the four font samples, each in its own face.
export function ModeControl({
  ink,
  mode,
  font,
  fontsOpen,
  onMode,
  onFont,
  ref,
}: {
  ink: Ink | null;
  mode: Mode;
  font: Font;
  // the samples are a pop-up over the mat, not a fifth object on the strip
  fontsOpen: boolean;
  onMode: (m: Mode) => void;
  onFont: (f: Font) => void;
  // the editor closes the samples on a press anywhere but in here. React 19
  // hands a function component its `ref` as a plain prop: no forwardRef.
  ref?: Ref<HTMLDivElement>;
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
    <div
      ref={ref}
      className="relative shrink-0"
      // A press here takes no focus: a text box being placed keeps its hidden
      // textarea focused, so a phone keeps its keyboard up while a font is
      // picked for it (#80). The click still happens.
      onPointerDown={(e) => e.preventDefault()}
    >
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

      {/* the samples ARE the choice: each label in its own face. Centred on
          the rocker, which sits near the middle of the centred tray (#82):
          hung off either edge, the row runs off a 360px mat. */}
      {ink && fontsOpen && (
        <div className="-translate-x-1/2 absolute bottom-[calc(100%+10px)] left-1/2 z-30 flex gap-1.5">
          {FONTS.map((f) => (
            <FontChip
              key={f}
              font={f}
              active={f === font}
              tint={tint}
              onPick={onFont}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// How much of each pad in the chooser's stack shows above the next (#81): the
// height left once the top pad lies whole, shared by the five under it, and
// never less than a thumb — past that the stack scrolls. `cqh` is a percent of
// the chooser's own height (it is a size container), so the fit is CSS, with
// nothing measured.
const PEEK = `max(${TOUCH}px, (100cqh - ${PAPER_SIDE}) / 5)`;

// The pad chooser (#81): with no note on the mat, the mat is six pads at the
// note's real size, square to the screen, stacked down it so each shows a
// strip and the last lies whole on top. Put away, the pads slide off and fade
// — all but the one torn from, which has just become the sheet.
// ponytail: no grid. #81 wants one wherever all six fit at real size; two pads
// do sit side by side in landscape at desktop sizes, but six never fit at
// PAPER_SIDE — a 2×3 or 3×2 grid needs two rows (≈120svh) or two columns
// (≈176vw). So the stack is the only layout that rule can pick. Upgrade: a
// grid under a container query, if the paper ever shrinks enough for six.
export function PadChooser({
  putAway,
  torn,
  onTear,
  ref,
}: {
  // a note is on the mat: the pads slide out of sight and out of reach
  putAway: boolean;
  // the colour of that note, whose pad went with the sheet
  torn: PaperColour | null;
  onTear: (colour: PaperColour, pad: HTMLElement) => void;
  // the first pad, for the keyboard to start on
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <div
      data-slot="chooser"
      inert={putAway}
      className="absolute inset-x-0 top-16 overflow-y-auto overscroll-contain"
      style={{
        bottom: "max(0.75rem, env(safe-area-inset-bottom))",
        containerType: "size",
      }}
    >
      <div className="flex flex-col items-center">
        {PAPER_COLOURS.map((colour, i) => (
          <button
            key={colour}
            ref={i === 0 ? ref : undefined}
            type="button"
            aria-label={`Tear off ${colour === "orange" ? "an" : "a"} ${colour} sheet`}
            onClick={(e) => onTear(colour, e.currentTarget)}
            // The focus ring drawn inside the pad: outside, the rest of the
            // pad's ring pokes out from under the pads stacked over it. `!`
            // because the site-wide focus ring is unlayered CSS, which beats
            // any utility that isn't important.
            className={`focus-visible:-outline-offset-4! shrink-0 rounded-[3px] border-0 p-0 ${STILL}`}
            style={{
              width: PAPER_SIDE,
              height: PAPER_SIDE,
              marginTop: i ? `calc(${PEEK} - ${PAPER_SIDE})` : 0,
              backgroundColor: PAPER[colour],
              backgroundImage:
                "linear-gradient(170deg, rgba(255,255,255,.4), rgba(255,255,255,0) 45%)",
              // the block of sheets under the top one shows along its bottom
              // edge, and each pad throws a shadow up onto the strip behind it
              boxShadow:
                "inset 0 -7px 0 rgba(0,0,0,.08), 0 -3px 8px rgba(0,0,0,.25), 0 6px 12px rgba(0,0,0,.4)",
              visibility: torn === colour ? "hidden" : undefined,
              opacity: putAway ? 0 : 1,
              transform: putAway ? "translateY(12vh)" : "none",
              transition: `transform ${CHOOSER_MS}ms ${EASE_OUT}, opacity ${CHOOSER_MS}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// The bin at the right end of the strip: a tapered steel basket. Inert with no
// note on the mat — there is nothing to throw away.
export function Bin({
  onClick,
  disabled,
  ref,
}: {
  onClick: () => void;
  disabled: boolean;
  // where the keyboard comes back to when the bin's question is answered no
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
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

// The bin's question (#81): a slip of paper that pops up over the bin before a
// note with anything on it goes in. What a press anywhere else means is the
// editor's business.
export function BinSlip({
  onBin,
  onKeep,
  onLeave,
  ref,
}: {
  onBin: () => void;
  onKeep: () => void;
  // focus has gone somewhere outside the slip (Tab away): keep the note, and
  // leave the keyboard where it went
  onLeave: () => void;
  // the tick, which takes the keyboard when the slip appears
  ref?: Ref<HTMLButtonElement>;
}) {
  const answer =
    "flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0 text-[1.5rem] leading-none";
  // a page-unique id, so the group can be named by its own "bin it?"
  const question = useId();
  return (
    // A fieldset is a group to a screen reader; named by aria-labelledby, not
    // a <legend>, which browsers draw on the border outside the flex row.
    <fieldset
      aria-labelledby={question}
      // React's onBlur bubbles up from the buttons inside. `relatedTarget` is
      // where focus is going; `contains(null)` is false, so leaving the page
      // counts as leaving the slip.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onLeave();
      }}
      className="absolute right-0 bottom-[calc(100%+10px)] z-50 flex items-center py-0.5 pr-0.5 pl-3"
      style={{
        background: "linear-gradient(180deg,#fffdf6,#ece3cf)",
        boxShadow: "0 4px 9px rgba(0,0,0,.45)",
        color: "#4a412c",
        fontFamily: FONT_FAMILIES.casual,
        fontSize: 19,
        transform: "rotate(-2deg)",
      }}
    >
      <span id={question} className="mr-1 whitespace-nowrap">
        bin it?
      </span>
      <button
        ref={ref}
        type="button"
        aria-label="Bin it"
        onClick={onBin}
        className={answer}
        style={{ color: "#b91c1c" }}
      >
        ✓
      </button>
      <button
        type="button"
        aria-label="Keep it"
        onClick={onKeep}
        className={answer}
      >
        ✕
      </button>
    </fieldset>
  );
}

// The sticker sheet's tab (#75): the corner of a sheet of stickers lying in
// the tray. It stays there while the sheet is up (#82), pressed in, and is
// still the thing you tap to put the sheet away.
export function StickerTab({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${open ? "Close" : "Open"} the sticker sheet`}
      aria-expanded={open}
      onClick={onClick}
      className="relative flex shrink-0 items-end justify-center border-0 bg-transparent p-0"
      style={TAB_SLOT}
    >
      <span
        aria-hidden="true"
        className={`relative flex items-start justify-center ${STILL}`}
        style={{
          width: STICKER_TAB_W,
          height: STICKER_TAB_H,
          paddingTop: 7,
          borderRadius: "4px 4px 1px 1px",
          fontSize: 17,
          lineHeight: 1,
          // pressed: pushed down into the tray, shaded, its shadow tucked in
          background: open
            ? "linear-gradient(180deg,#e4dfd2,#d3ccbc)"
            : "linear-gradient(180deg,#ffffff,#ece8de)",
          boxShadow: open
            ? "inset 0 2px 4px rgba(0,0,0,.3), 0 1px 2px rgba(0,0,0,.3)"
            : "0 -2px 8px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.3)",
          transform: open ? "translateY(3px)" : "none",
          transition: `transform 160ms ${EASE_OUT}, background 160ms, box-shadow 160ms`,
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

// "pin it up" (#82) is loud tape hung just above the note, and the editor keeps
// PIN_ROOM clear over the paper for it: one line of its text, its padding, the
// gap it stands off the paper by, and the few px its tilt lifts one end (-2.2°
// across ~210px of tape is ~8px, half of it above the middle). The label is
// sized from these same numbers, so the room and the tape can't drift apart.
const LOUD_TEXT = 38; // px, twice the quiet tape's
const LOUD_LINE = 1.375; // Tailwind's leading-snug, as the quiet tape has
const LOUD_PAD_Y = 12;
const PIN_GAP = 8;
const TILT_RISE = 4;
export const PIN_ROOM = Math.ceil(
  LOUD_TEXT * LOUD_LINE + 2 * LOUD_PAD_Y + PIN_GAP + TILT_RISE,
);

// A strip of masking tape with a word on it, in the casual hand: the desk's own
// buttons ("pin it up", "back to the desk"), stuck on rather than printed.
export function TapeLabel({
  children,
  onClick,
  loud = false,
  away = false,
  className = "",
  ref,
}: {
  children: ReactNode;
  onClick: () => void;
  // "pin it up" (#82): the one thing on the mat that should shout, so twice
  // the size, on the site's orange, standing PIN_GAP off what it hangs over.
  // Not bold: the casual hand comes in one weight, and the browser would fake
  // a second.
  loud?: boolean;
  // what it labels is in flight: faded out, and out of reach until it lands
  away?: boolean;
  className?: string;
  // for whoever puts the keyboard back on it; a plain prop in React 19
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      inert={away}
      className={`border-0 ${loud ? "" : "px-4 py-1.5 text-[1.1875rem] leading-snug"} ${STILL} ${className}`}
      style={{
        ...TAPE,
        ...(loud
          ? {
              fontSize: LOUD_TEXT,
              lineHeight: LOUD_LINE,
              padding: `${LOUD_PAD_Y}px 32px`,
              marginBottom: PIN_GAP,
            }
          : {}),
        // the theme's own tokens, so the orange follows light and dark
        backgroundColor: loud ? "var(--color-accent-2)" : TAPE.backgroundColor,
        color: loud ? "var(--color-on-accent-2)" : "#4a412c",
        fontFamily: FONT_FAMILIES.casual,
        opacity: away ? 0 : 1,
        transition: "opacity 160ms",
      }}
    >
      {children}
    </button>
  );
}
