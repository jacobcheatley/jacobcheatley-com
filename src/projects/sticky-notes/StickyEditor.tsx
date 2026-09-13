import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { EASE_OUT } from "./desk";
import {
  addElement,
  bounds,
  clampCoord,
  cycleHit,
  type Element,
  emptyNote,
  hitTest,
  hitTestAll,
  isOffNote,
  moveElement,
  removeElement,
  settleElement,
  updateElement,
} from "./note-editor";
import { FONT_FAMILIES, loadFont } from "./note-fonts";
import {
  INK,
  NOTE_PAPER_ASPECT_RATIO,
  NotePaper,
  PAPER,
  renderElement,
} from "./note-render";
import {
  CANVAS,
  FONTS,
  type Font,
  INKS,
  type Ink,
  MAX_POINTS_PER_STROKE,
  MAX_TEXT_LEN,
  type NoteContent,
  PAPER_COLOURS,
  type PaperColour,
} from "./note-schema";

// What lies on the cutting mat (#73, #74): the pad stack, the sheet torn off it,
// the bin, and the stationery — four markers, the draw/write control and the
// eraser. The mat surface itself is StickyMat; this is the island it lazy-loads,
// and the file the later tickets grow into: T5 hangs the sticker sheet off the
// reserved tab slot, T6 rotates the note and adds on-note handles, T7 the
// pinning phase.
//
// The mat starts bare — no note, no prompt copy — so nothing random runs until
// the visitor tears a sheet off. That is why the island needs no mounted-gate
// for SSR: its first render is identical on both sides.
//
// Tools are objects, not settings (#69): the marker IS the ink, so there are no
// swatches, no size slider and no colour fan. One tool is held at a time;
// holding nothing is hand mode. All model logic lives in note-editor — this
// shell only maps pointers onto it.

const FAN_MS = 250;
const TEAR_MS = 400;
const CRUMPLE_MS = 400;
const LIFT_MS = 220; // cap off, body lifts — the bit #70 liked most
const GHOST_MS = 200; // how long a rubbed-out element lingers as a fade

const PAD = 48; // a pad's size — a thumb target, per the T0 verdict (#70)
const FAN_STEP = 46; // fanned spacing: each pad keeps a ≥44px-wide target
const FAN_LIFT = 76; // how far the fan rises off the strip

const NIB = 8; // the editor's one fixed marker size (#69: no size slider)
const TEXT_SIZE = 30;
const TEXT_W = 240;

// Tool sizes. The drawn objects are fixed; only the air around them flexes, so
// a narrow strip closes the gaps instead of shrinking the stationery.
const MARKER_W = 22;
const MARKER_H = 72;
const TOOL_H = 88;
const ERASER_W = 36;
const ERASER_H = 26;
const ROCKER_W = 32;
const ROCKER_H = 46;
const FONT_CHIP = 44;

// The draw/write control with nothing in your hand: inert stationery grey.
const GREY = "#8a8371";

// Where the pointer sits inside the tool image that rides a mouse: the marker's
// nib tip, the eraser's rubbing corner.
const MARKER_HOTSPOT: [number, number] = [MARKER_W / 2, MARKER_H + 8];
const ERASER_HOTSPOT: [number, number] = [5, ERASER_H - 3];

const MID = (PAPER_COLOURS.length - 1) / 2;

// ponytail: the tear-off and crumple fly from fixed viewport-relative points
// (the pad stack's corner, the bin's corner) rather than the objects' measured
// boxes. Upgrade to a measured FLIP if the strip ever moves off the bottom edge
// — T7 needs real measurement anyway for the note's travel onto the wall.
const TEAR_FROM = "translate(-34vw, 36vh) rotate(-16deg) scale(.12)";
const CRUMPLE_TO = "translate(34vw, 38vh) rotate(260deg) scale(.06)";

// Tailwind's `!`: these transitions are inline (their timings are JS constants),
// and only an important rule can switch them off for prefers-reduced-motion.
const STILL = "motion-reduce:transition-none!";

type StrokeEl = Extract<Element, { type: "stroke" }>;
type TextEl = Extract<Element, { type: "text" }>;
// Nothing held is hand mode — the absence of a tool, not a tool of its own.
type Held = Ink | "eraser" | null;
type Mode = "draw" | "write";

const isInk = (held: Held): held is Ink => held !== null && held !== "eraser";

export default function StickyEditor({
  initialContent = null,
}: {
  // Tests seed a half-built note; the UI always starts from a torn-off sheet.
  initialContent?: NoteContent | null;
}) {
  const [content, setContent] = useState<NoteContent | null>(initialContent);
  const [fanned, setFanned] = useState(false);
  // The pads are only a target once they have flown: a second tap landing on
  // the stack mid-flight would otherwise tear off whichever colour is passing.
  const [fanSettled, setFanSettled] = useState(false);
  // `tearing` parks the fresh sheet at the pad for one frame; dropping it lets
  // the transition carry the sheet to the middle of the mat. `crumpling` is the
  // same trick in reverse, into the bin.
  const [tearing, setTearing] = useState(false);
  const [crumpling, setCrumpling] = useState(false);

  const [held, setHeld] = useState<Held>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [font, setFont] = useState<Font>("casual"); // the editor's default
  const [selected, setSelected] = useState(-1);
  const [textDraft, setTextDraft] = useState<TextEl | null>(null);
  // A finger leaves the tool docked on the mat, so the dock has to show the
  // stroke happening; a mouse carries the tool itself.
  const [using, setUsing] = useState(false);
  const [fine, setFine] = useState(false);
  // Elements have no id, so a removed one can't fade in place: its ghost is
  // re-drawn on an overlay that fades out and unmounts.
  const [ghost, setGhost] = useState<Element | null>(null);
  const [ghostOut, setGhostOut] = useState(false);

  const trigger = useRef<HTMLButtonElement>(null);
  const firstPad = useRef<HTMLButtonElement>(null);
  const crumpleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const paperRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Transient pointer state lives in refs (no re-render on read); the live
  // stroke uses forceRender so the note grows as you draw.
  const draftRef = useRef<StrokeEl | null>(null);
  const dragRef = useRef<{ index: number; x: number; y: number } | null>(null);
  const rubbingRef = useRef(false);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // Two frames, not one: a single rAF can run before the browser has taken a
  // style recalc of the just-parked sheet, and the sheet then appears in the
  // middle of the mat without ever having travelled.
  useEffect(() => {
    if (!tearing) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setTearing(false));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [tearing]);

  // The fan's whole life: settle it, put the keyboard on it, let Escape close it.
  useEffect(() => {
    if (!fanned) {
      setFanSettled(false);
      return;
    }
    firstPad.current?.focus();
    const timer = setTimeout(() => setFanSettled(true), FAN_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setFanned(false);
      trigger.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [fanned]);

  useEffect(() => () => clearTimeout(crumpleTimer.current), []);

  // A mouse can carry the tool and hide its own cursor; a finger cannot, so the
  // tool stays docked. Read in an effect, never during render — SSR has no
  // matchMedia and hydration must not disagree with the server.
  useEffect(() => {
    const mq = window.matchMedia?.("(pointer: fine)");
    if (!mq) return;
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Warm the write font so the first text box paints in the right family, and
  // every sample's own face the moment the samples are on screen.
  const writing = isInk(held) && mode === "write";
  useEffect(() => {
    loadFont(font);
    if (writing) for (const f of FONTS) loadFont(f);
  }, [font, writing]);

  // Focus the text box AFTER the placing tap settles. Focusing it synchronously
  // mid-gesture lets that same tap's trailing events blur it straight back out
  // — an instant empty commit (the phase 1 lesson).
  const textOpen = textDraft !== null;
  useEffect(() => {
    if (!textOpen) return;
    const id = requestAnimationFrame(() => textRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [textOpen]);

  // The ghost's fade: mount opaque, flip to transparent a frame later (a
  // transition needs a painted start), unmount once it has faded.
  useEffect(() => {
    if (!ghost) return;
    setGhostOut(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setGhostOut(true));
    });
    const timer = setTimeout(() => setGhost(null), GHOST_MS + 80);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      clearTimeout(timer);
    };
  }, [ghost]);

  // A pad with no note on the mat tears a fresh sheet off; with a note already
  // there it swaps the stock under the content. Both wait for the objects to
  // stop moving — mid-crumple there is no note to swap the paper under yet.
  function takeSheet(colour: PaperColour) {
    if (!fanSettled || crumpling) return;
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
    setSelected(-1);
    setCrumpling(true);
    crumpleTimer.current = setTimeout(() => {
      setCrumpling(false);
      // the live colour, not the one captured at the tap
      setContent((c) => ({ ...emptyNote(), colour: c?.colour ?? colour }));
      setTearing(true);
    }, CRUMPLE_MS);
  }

  // Tapping a tool picks it up; tapping the one in your hand (or any other
  // tool) puts it down. Selection is a hand-mode idea, so it goes with the hand.
  function pickUp(tool: Exclude<Held, null>) {
    setHeld((h) => (h === tool ? null : tool));
    setSelected(-1);
    hideCursorTool();
  }

  // --- the paper -----------------------------------------------------------
  // Pointer → note coordinates. NotePaper has no fastener headroom, so the
  // paper's box IS 0..CANVAS on both axes. T6 folds the note's rotation in here.
  function toNote(e: ReactPointerEvent): [number, number, number] {
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return [0, 0, 0.5];
    return [
      clampCoord(((e.clientX - rect.left) / rect.width) * CANVAS),
      clampCoord(((e.clientY - rect.top) / rect.height) * CANVAS),
      e.pressure || 0.5,
    ];
  }

  function onPaperDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!content || tearing || crumpling) return;
    // A tap anywhere else — the paper included — commits the open text box.
    if (textDraft) {
      commitText();
      return;
    }
    const [x, y, p] = toNote(e);
    // jsdom has no pointer capture; the `?.` is for it, not for browsers.
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (held === "eraser") {
      rubbingRef.current = true;
      setUsing(true);
      rub(x, y);
      return;
    }
    if (isInk(held)) {
      if (mode === "write") {
        setTextDraft({
          type: "text",
          x,
          y,
          w: Math.max(60, Math.min(TEXT_W, CANVAS - x)),
          text: "",
          font,
          color: held,
          fontSize: TEXT_SIZE,
          rotation: 0,
        });
        return;
      }
      setUsing(true);
      draftRef.current = {
        type: "stroke",
        ink: held,
        size: NIB,
        points: [[x, y, p]],
      };
      forceRender();
      return;
    }

    // hand mode: the top hit, or one layer deeper when this spot is already
    // the selection's
    const hits = hitTestAll(content, x, y);
    const next = cycleHit(hits, selected);
    setSelected(next);
    dragRef.current = next < 0 ? null : { index: next, x, y };
  }

  function onPaperMove(e: ReactPointerEvent<HTMLDivElement>) {
    followCursorTool(e);
    if (!content) return;

    const draft = draftRef.current;
    if (draft) {
      if (draft.points.length >= MAX_POINTS_PER_STROKE) return;
      const [x, y, p] = toNote(e);
      draft.points.push([x, y, p]);
      forceRender();
      return;
    }
    if (rubbingRef.current) {
      const [x, y] = toNote(e);
      rub(x, y);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const [x, y] = toNote(e);
    const dx = x - drag.x;
    const dy = y - drag.y;
    drag.x = x;
    drag.y = y;
    // Deliberately unclamped: an element that can't leave the paper can never
    // be dragged off it to be deleted. Settled or deleted on release.
    setContent((c) => c && moveElement(c, drag.index, dx, dy));
  }

  function onPaperUp() {
    setUsing(false);
    rubbingRef.current = false;

    const draft = draftRef.current;
    if (draft) {
      draftRef.current = null;
      // A dot (single point) draws nothing via perfect-freehand — needs ≥2, so
      // a tap in draw mode leaves no mark.
      if (draft.points.length >= 2)
        setContent((c) => c && addElement(c, draft));
      forceRender();
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const el = content?.elements[drag.index];
    if (!el) return;
    if (isOffNote(el)) {
      setGhost(el);
      setContent((c) => c && removeElement(c, drag.index));
      setSelected(-1);
      return;
    }
    const settled = settleElement(el);
    if (settled !== el)
      setContent((c) => c && updateElement(c, drag.index, settled));
  }

  // One rub of the eraser: whatever is under the nib goes, with a fade.
  function rub(x: number, y: number) {
    if (!content) return;
    const hit = hitTest(content, x, y);
    const el = content.elements[hit];
    if (!el) return;
    setGhost(el);
    setContent(removeElement(content, hit));
  }

  function commitText() {
    const draft = textDraft;
    setTextDraft(null);
    const text = draft?.text.trim();
    if (!draft || !text) return; // an empty box adds nothing
    setContent((c) => c && addElement(c, { ...draft, text }));
  }

  // --- the tool riding the cursor -----------------------------------------
  // Positioned by hand rather than by state: a pointermove per frame must not
  // re-render the note.
  function followCursorTool(e: ReactPointerEvent) {
    const el = cursorRef.current;
    if (!el) return;
    const [hx, hy] = held === "eraser" ? ERASER_HOTSPOT : MARKER_HOTSPOT;
    el.style.opacity = "1";
    el.style.transform = `translate(${e.clientX - hx}px, ${e.clientY - hy}px)`;
  }

  function hideCursorTool() {
    const el = cursorRef.current;
    if (el) el.style.opacity = "0";
  }

  const draft = draftRef.current;
  // The live stroke and the open text box are elements like any other, so they
  // render through the same NotePaper path the committed note uses — which is
  // what makes typing WYSIWYG rather than an overlay that lies about its size.
  const shown =
    content && (textDraft ?? draft)
      ? addElement(content, (textDraft ?? draft) as Element)
      : content;
  const selectedEl = selected >= 0 ? content?.elements[selected] : undefined;

  return (
    <div className="absolute inset-0 select-none">
      {/* the sheet: bare paper, centred, clear of the strip */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-32">
        {shown && (
          <div
            ref={paperRef}
            data-colour={shown.colour}
            className={`${STILL} pointer-events-auto relative touch-none`}
            onPointerDown={onPaperDown}
            onPointerMove={onPaperMove}
            onPointerUp={onPaperUp}
            onPointerCancel={onPaperUp}
            onPointerLeave={hideCursorTool}
            style={{
              width: "min(88vw, 60vh)",
              aspectRatio: NOTE_PAPER_ASPECT_RATIO,
              filter: "drop-shadow(3px 9px 12px rgba(0,0,0,.45))",
              // the held tool IS the cursor over the paper
              cursor: fine && held ? "none" : undefined,
              ...noteMotion(tearing, crumpling),
            }}
          >
            <NotePaper content={shown} />

            {/* T6 replaces this with the element's rotated box plus handles */}
            {selectedEl && (
              <svg
                viewBox={`0 0 ${CANVAS} ${CANVAS}`}
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <title>selection</title>
                {selectionRect(selectedEl)}
              </svg>
            )}

            {ghost && (
              <svg
                viewBox={`0 0 ${CANVAS} ${CANVAS}`}
                className={`${STILL} pointer-events-none absolute inset-0 h-full w-full`}
                aria-hidden="true"
                style={{
                  opacity: ghostOut ? 0 : 1,
                  transition: `opacity ${GHOST_MS}ms linear`,
                }}
              >
                <title>rubbed out</title>
                {renderElement(ghost, 0)}
              </svg>
            )}

            {/* WYSIWYG: the visible text is the SVG above; this only catches
                keystrokes, so it is invisible and never takes the pointer. */}
            {textDraft && (
              <textarea
                ref={textRef}
                aria-label="Text box"
                value={textDraft.text}
                maxLength={MAX_TEXT_LEN}
                onChange={(e) =>
                  setTextDraft((d) => d && { ...d, text: e.target.value })
                }
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  e.preventDefault();
                  setTextDraft(null);
                }}
                className="pointer-events-none absolute resize-none border-0 bg-transparent p-0 opacity-0 outline-none"
                style={textBoxStyle(textDraft)}
              />
            )}
          </div>
        )}
      </div>

      {/* a fanned stack closes on a tap anywhere else on the mat */}
      {fanned && (
        <button
          type="button"
          aria-label="Close the pads"
          className="absolute inset-0 z-20 h-full w-full cursor-default border-0 bg-transparent p-0"
          onClick={() => setFanned(false)}
        />
      )}

      {/* the desk strip: the mat's bottom edge, where the objects lie. Three
          groups — left: the pads; centre: the markers and the draw/write
          control; right: T5's sticker tab, the eraser, then the bin. */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div
          className="relative z-30 shrink-0"
          style={{ width: PAD + 12, height: PAD + 8 }}
        >
          {PAPER_COLOURS.map((colour, i) => (
            <button
              key={colour}
              type="button"
              ref={i === 0 ? firstPad : undefined}
              // Closed, the pads are not individually reachable: the stack in
              // front of them is the only target.
              disabled={!fanned}
              aria-label={
                content
                  ? `Switch to ${colour} paper`
                  : `Tear off ${colour === "orange" ? "an" : "a"} ${colour} sheet`
              }
              onClick={() => takeSheet(colour)}
              className={`absolute bottom-0 left-0 rounded-[3px] border-0 p-0 ${STILL}`}
              style={padStyle(i, colour, fanned, content?.colour === colour)}
            />
          ))}
          <button
            type="button"
            ref={trigger}
            aria-label="Fan out the pads"
            aria-expanded={fanned}
            onClick={() => setFanned((open) => !open)}
            className="-inset-1.5 absolute z-30 border-0 bg-transparent p-0"
          />
        </div>

        <div className="flex min-h-12 min-w-0 flex-1 items-end justify-center gap-1">
          {INKS.map((ink) => (
            <ToolSlot
              key={ink}
              label={`${held === ink ? "Put down" : "Pick up"} the ${ink} marker`}
              held={held === ink}
              onClick={() => pickUp(ink)}
            >
              <MarkerBody ink={ink} held={held === ink} using={using} />
            </ToolSlot>
          ))}
          <ModeControl
            ink={isInk(held) ? held : null}
            mode={mode}
            font={font}
            onMode={setMode}
            onFont={(f) => {
              setFont(f);
              setMode("write");
            }}
          />
        </div>

        <div className="flex shrink-0 items-end gap-1">
          {/* T5 fills this with the sticker sheet's tab */}
          <div data-slot="sticker-tab" className="min-h-12 min-w-12" />
          <div data-slot="eraser">
            <ToolSlot
              label={`${held === "eraser" ? "Put down" : "Pick up"} the eraser`}
              held={held === "eraser"}
              onClick={() => pickUp("eraser")}
            >
              <EraserBody held={held === "eraser"} using={using} />
            </ToolSlot>
          </div>
          <Bin onClick={binIt} disabled={!content || crumpling} />
        </div>
      </div>

      {/* the held tool, riding a mouse with its nib on the hotspot. Parked
          off-screen until the pointer is over the paper. */}
      {fine && held && (
        <div
          ref={cursorRef}
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 z-50 opacity-0"
          style={{ transition: "opacity 140ms" }}
        >
          <div
            style={{
              transform:
                held === "eraser" ? "rotate(-22deg)" : "rotate(-28deg)",
              transformOrigin: (held === "eraser"
                ? ERASER_HOTSPOT
                : MARKER_HOTSPOT
              )
                .map((n) => `${n}px`)
                .join(" "),
            }}
          >
            {held === "eraser" ? <EraserBody /> : <MarkerBody ink={held} />}
          </div>
        </div>
      )}
    </div>
  );
}

function noteMotion(tearing: boolean, crumpling: boolean): CSSProperties {
  if (crumpling)
    return {
      transform: CRUMPLE_TO,
      opacity: 0,
      transition: `transform ${CRUMPLE_MS}ms cubic-bezier(.5,0,.8,.35), opacity ${CRUMPLE_MS}ms ease-in`,
    };
  if (tearing) return { transform: TEAR_FROM, transition: "none" };
  return {
    transform: "none",
    transition: `transform ${TEAR_MS}ms ${EASE_OUT}`,
  };
}

// The dashed box around the selection, in note units.
function selectionRect(el: Element) {
  const b = bounds(el);
  return (
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
}

// The hidden textarea sits exactly over the box it is typing into, in percent
// so it needs no measurement of the paper.
function textBoxStyle(el: TextEl): CSSProperties {
  const b = bounds(el);
  const pc = (n: number) => `${(n / CANVAS) * 100}%`;
  return {
    left: pc(b.x0),
    top: pc(b.y0),
    width: pc(b.x1 - b.x0),
    height: pc(Math.max(el.fontSize, b.y1 - b.y0)),
  };
}

// A tool lying in its slot on the mat: the object plus the shadow that IS the
// slot. The whole slot is the target — tall rather than wide, because the strip
// has nine objects to fit across a phone.
function ToolSlot({
  label,
  held,
  onClick,
  children,
}: {
  label: string;
  held: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative flex min-w-9 shrink items-end justify-center border-0 bg-transparent p-0"
      style={{ height: TOOL_H }}
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
function MarkerBody({
  ink,
  held = false,
  using = false,
}: {
  ink: Ink;
  held?: boolean;
  using?: boolean;
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
          transform: using
            ? "translateY(-27px) rotate(-16deg)"
            : held
              ? "translateY(-17px) rotate(-7deg)"
              : "none",
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
    </span>
  );
}

// A block eraser: cream rubber with a purple band.
function EraserBody({
  held = false,
  using = false,
}: {
  held?: boolean;
  using?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none relative block ${STILL}`}
      style={{
        width: ERASER_W,
        height: ERASER_H,
        borderRadius: 3,
        background: "linear-gradient(180deg,#fbf6ee,#dbd0bf)",
        boxShadow: "0 3px 6px rgba(0,0,0,.45), inset 0 -4px 0 rgba(0,0,0,.07)",
        transform: using
          ? "translateY(-26px) rotate(-13deg)"
          : held
            ? "translateY(-17px) rotate(-6deg)"
            : "none",
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

// Draw or write with the marker in your hand: one rocker, tinted with that
// marker's ink so it reads as part of it, inert and grey with an empty hand.
// The "Aa" side opens the four font samples, each in its own face.
function ModeControl({
  ink,
  mode,
  font,
  onMode,
  onFont,
}: {
  ink: Ink | null;
  mode: Mode;
  font: Font;
  onMode: (m: Mode) => void;
  onFont: (f: Font) => void;
}) {
  const tint = ink ? INK[ink] : GREY;
  const half = (
    m: Mode,
    label: string,
    glyph: React.ReactNode,
  ): React.ReactNode => {
    const on = mode === m;
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        disabled={!ink}
        onClick={() => onMode(m)}
        className={`relative flex items-center justify-center border-0 border-slate-900/15 border-l p-0 first:border-l-0 disabled:opacity-70 ${STILL}`}
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
      {/* the samples ARE the choice: each label in its own face */}
      {ink && mode === "write" && (
        <div
          className="-translate-x-1/2 absolute bottom-[calc(100%+10px)] left-1/2 grid grid-cols-2 gap-1.5"
          style={{ width: 2 * FONT_CHIP + 6 }}
        >
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

      <div
        className="flex items-stretch overflow-hidden rounded-[5px]"
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
      aria-label="Bin this note"
      onClick={onClick}
      disabled={disabled}
      className="relative flex h-14 w-14 items-end justify-center border-0 bg-transparent p-0 disabled:opacity-45"
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
