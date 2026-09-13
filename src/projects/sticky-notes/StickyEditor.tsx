import { type CSSProperties, useEffect, useState } from "react";
import { emptyNote } from "./note-editor";
import { NOTE_PAPER_ASPECT_RATIO, NotePaper, PAPER } from "./note-render";
import {
  type NoteContent,
  PAPER_COLOURS,
  type PaperColour,
} from "./note-schema";

// What lies on the cutting mat (#73): the pad stack, the sheet torn off it, and
// the bin — the objects a note is born from and dies in. The mat surface itself
// is StickyMat; this is the island it lazy-loads, and the file every later
// ticket grows into: T4 hangs the markers, the draw/write control and the eraser
// off the strip's reserved runs, T5 the sticker sheet tab, T6 the on-note
// pointer input, T7 the pinning phase.
//
// The mat starts bare — no note, no prompt copy — so nothing random runs until
// the visitor tears a sheet off. That is why the island needs no mounted-gate
// for SSR: its first render is identical on both sides.

// Motion, all CSS: no animation library anywhere in this spec (#69). The mat's
// own ease-out from the T0 prototype — quick off the mark, long settle. Spelled
// out here rather than imported from StickyMat: that module lazy-imports this
// one, and a static import back would close the loop.
const EASE_OUT = "cubic-bezier(.2,.8,.25,1)";
const FAN_MS = 250;
const TEAR_MS = 400;
const CRUMPLE_MS = 400;

const PAD = 48; // a pad's size — a thumb target, per the T0 verdict (#70)
const FAN_STEP = 46; // fanned spacing: each pad keeps a ≥44px-wide target
const FAN_LIFT = 76; // how far the fan rises off the strip

const MID = (PAPER_COLOURS.length - 1) / 2;

// ponytail: the tear-off and crumple fly from fixed viewport-relative points
// (the pad stack's corner, the bin's corner) rather than the objects' measured
// boxes. Upgrade to a measured FLIP if the strip ever moves off the bottom edge
// — T7 needs real measurement anyway for the note's travel onto the wall.
const TEAR_FROM = "translate(-34vw, 36vh) rotate(-16deg) scale(.12)";
const CRUMPLE_TO = "translate(34vw, 38vh) rotate(260deg) scale(.06)";

export default function StickyEditor({
  initialContent = null,
}: {
  // Only the tests seed a half-built note: until T4 there is no way to put an
  // element on the paper through the UI.
  initialContent?: NoteContent | null;
}) {
  const [content, setContent] = useState<NoteContent | null>(initialContent);
  const [fanned, setFanned] = useState(false);
  // `tearing` parks the fresh sheet at the pad for one frame; dropping it lets
  // the transition carry the sheet to the middle of the mat. `crumpling` is the
  // same trick in reverse, into the bin.
  const [tearing, setTearing] = useState(false);
  const [crumpling, setCrumpling] = useState(false);

  useEffect(() => {
    if (!tearing) return;
    const frame = requestAnimationFrame(() => setTearing(false));
    return () => cancelAnimationFrame(frame);
  }, [tearing]);

  // A pad with no note on the mat tears a fresh sheet off; with a note already
  // there it swaps the stock under the content.
  function takeSheet(colour: PaperColour) {
    setFanned(false);
    if (content) {
      setContent({ ...content, colour });
      return;
    }
    setContent({ ...emptyNote(), colour });
    setTearing(true);
  }

  function binIt() {
    if (!content || crumpling) return;
    const { colour } = content;
    setCrumpling(true);
    setTimeout(() => {
      setCrumpling(false);
      setContent({ ...emptyNote(), colour });
      setTearing(true);
    }, CRUMPLE_MS);
  }

  const noteMotion: CSSProperties = crumpling
    ? {
        transform: CRUMPLE_TO,
        opacity: 0,
        transition: `transform ${CRUMPLE_MS}ms cubic-bezier(.5,0,.8,.35), opacity ${CRUMPLE_MS}ms ease-in`,
      }
    : tearing
      ? { transform: TEAR_FROM, transition: "none" }
      : { transform: "none", transition: `transform ${TEAR_MS}ms ${EASE_OUT}` };

  return (
    <div className="absolute inset-0 select-none">
      {/* the sheet: bare paper, centred, clear of the strip. Inert until T4/T6
          give it pointer input. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-32">
        {content && (
          <div
            data-colour={content.colour}
            style={{
              width: "min(88vw, 60vh)",
              aspectRatio: NOTE_PAPER_ASPECT_RATIO,
              filter: "drop-shadow(3px 9px 12px rgba(0,0,0,.45))",
              ...noteMotion,
            }}
          >
            <NotePaper content={content} />
          </div>
        )}
      </div>

      {/* a fanned stack closes on a tap anywhere else on the mat */}
      {fanned && (
        <button
          type="button"
          aria-label="close the pad stack"
          className="absolute inset-0 z-20 h-full w-full cursor-default border-0 bg-transparent p-0"
          onClick={() => setFanned(false)}
        />
      )}

      {/* the desk strip: the mat's bottom edge, where the objects lie. Three
          groups so the later tickets drop into fixed runs — left: the pads;
          centre: T4's four markers + draw/write control; right: T5's sticker
          tab, T4's eraser, then the bin. */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div
          className="relative z-30 shrink-0"
          style={{ width: PAD + 12, height: PAD + 8 }}
        >
          {PAPER_COLOURS.map((colour, i) => (
            <button
              key={colour}
              type="button"
              // Closed, the pads are not individually reachable: the stack in
              // front of them is the only target.
              disabled={!fanned}
              aria-label={`${colour} pad`}
              onClick={() => takeSheet(colour)}
              className="absolute bottom-0 left-0 rounded-[3px] border-0 p-0"
              style={padStyle(i, colour, fanned, content?.colour === colour)}
            />
          ))}
          {!fanned && (
            <button
              type="button"
              aria-label="pad stack"
              onClick={() => setFanned(true)}
              className="absolute z-30 border-0 bg-transparent p-0"
              style={{ inset: -6 }}
            />
          )}
        </div>

        {/* reserved: T4's markers and the draw/write control */}
        <div className="flex min-h-12 flex-1 items-end justify-center gap-2" />

        <div className="flex shrink-0 items-end gap-2">
          {/* reserved: T5's sticker-sheet tab, then T4's eraser */}
          <Bin onClick={binIt} disabled={!content || crumpling} />
        </div>
      </div>
    </div>
  );
}

// Resting, the pads sit as one compact pile; fanned, they lie in a shallow arc
// with every colour a thumb's width of its own (the T0 slivers were unhittable).
function padStyle(
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
    zIndex: 10 + i,
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
function Bin({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="bin the note"
      onClick={onClick}
      disabled={disabled}
      className="relative flex h-14 w-14 items-end justify-center border-0 bg-transparent p-0 disabled:opacity-45"
    >
      <span
        className="absolute right-1.5 left-1.5 block h-1.5 rounded-sm"
        style={{
          bottom: 46,
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
