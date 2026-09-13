import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { EASE_OUT, STILL } from "./desk";
import {
  Bin,
  EraserBody,
  FAN_MS,
  heldTool,
  MarkerBody,
  type Mode,
  ModeControl,
  PAD,
  padStyle,
  SHAKE_MS,
  StickerTab,
  ToolSlot,
} from "./desk-objects";
import {
  addElement,
  bounds,
  clampCoord,
  cycleHit,
  emptyNote,
  hitTest,
  hitTestAll,
  isOffNote,
  moveElement,
  type Element as NoteElement,
  removeElement,
  settleElement,
  updateElement,
} from "./note-editor";
import { loadFont } from "./note-fonts";
import {
  NOTE_PAPER_ASPECT_RATIO,
  NotePaper,
  renderElement,
} from "./note-render";
import {
  CANVAS,
  FONTS,
  type Font,
  INKS,
  type Ink,
  MAX_ELEMENTS,
  MAX_POINTS_PER_STROKE,
  MAX_TEXT_LEN,
  type NoteContent,
  PAPER_COLOURS,
  type PaperColour,
} from "./note-schema";
import { SHEET_H, SHEET_MS, StickerSheet, TAB_PERCH } from "./StickerSheet";

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

const TEAR_MS = 400;
const CRUMPLE_MS = 400;
const GHOST_MS = 200; // how long a rubbed-out element lingers as a fade

const NIB = 8; // the editor's one fixed marker size (#69: no size slider)
const TEXT_SIZE = 30;
const TEXT_W = 240;

// ponytail: the tear-off and crumple fly from fixed viewport-relative points
// (the pad stack's corner, the bin's corner) rather than the objects' measured
// boxes. Upgrade to a measured FLIP if the strip ever moves off the bottom edge
// — T7 needs real measurement anyway for the note's travel onto the wall.
const TEAR_FROM = "translate(-34vw, 36vh) rotate(-16deg) scale(.12)";
const CRUMPLE_TO = "translate(34vw, 38vh) rotate(260deg) scale(.06)";

type StrokeEl = Extract<NoteElement, { type: "stroke" }>;
type TextEl = Extract<NoteElement, { type: "text" }>;
type StickerEl = Extract<NoteElement, { type: "sticker" }>;
// Nothing held is hand mode — the absence of a tool, not a tool of its own.
type Held = Ink | "eraser" | null;

const isInk = (held: Held): held is Ink => held !== null && held !== "eraser";

export default function StickyEditor({
  initialContent = null,
}: {
  // Tests seed a half-built note; the UI always starts from a torn-off sheet.
  initialContent?: NoteContent | null;
}) {
  const [content, setContent] = useState<NoteContent | null>(initialContent);
  // A pointermove's state update has not necessarily landed by the time the
  // next pointer event runs, and a drag has to read back what the previous
  // move wrote: settle-or-delete on release needs the moved element, and a rub
  // needs the elements the last rub left. This ref is the live note; `apply`
  // is the only way content changes, so the two can't drift.
  const contentRef = useRef(content);
  contentRef.current = content;
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
  // The font samples pop up over the mat, like the fanned pads: opened by the
  // "Aa" side of the rocker, closed by a tap elsewhere, Escape or a choice.
  const [fontsOpen, setFontsOpen] = useState(false);
  // The sticker sheet is independent of what is in your hand: opening it neither
  // puts a marker down nor picks anything up.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [textDraft, setTextDraft] = useState<TextEl | null>(null);
  // A finger leaves the tool docked on the mat, so the dock has to show the
  // stroke happening; a mouse carries the tool itself.
  const [using, setUsing] = useState(false);
  const [fine, setFine] = useState(false);
  // The note is full: the docked tool rocks so a dead pointer-down says why.
  const [shaking, setShaking] = useState(false);
  // Elements have no id, so a removed one can't fade in place: its ghost is
  // re-drawn on an overlay that fades out and unmounts. `out` travels with the
  // ghost, and `id` keys the overlay, so rubbing again mid-fade mounts a fresh
  // node at full opacity instead of reversing the one that is fading.
  // ponytail: one ghost at a time, the newest wins. Rubbing out a pile fades
  // only the last of them; keep a list if that ever reads wrong.
  const [ghost, setGhost] = useState<{
    el: NoteElement;
    out: boolean;
    id: number;
  } | null>(null);

  // How far the sticker tab has to rise to perch on the open sheet's corner.
  // Measured rather than assumed: where the tab rests is the strip's business,
  // and the strip's layout changes with the viewport.
  const [tabLift, setTabLift] = useState(0);

  const trigger = useRef<HTMLButtonElement>(null);
  const stickerTab = useRef<HTMLButtonElement>(null);
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
  const ghostTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ghostId = useRef(0);
  // One gesture at a time: while a stroke, rub or drag is live, events from any
  // other pointer are ignored rather than allowed to steal it. (T6 turns a
  // second finger into a cancel.)
  const activeId = useRef<number | null>(null);
  const busy = () =>
    draftRef.current !== null || rubbingRef.current || dragRef.current !== null;
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

  useEffect(
    () => () => {
      clearTimeout(crumpleTimer.current);
      clearTimeout(ghostTimer.current);
      clearTimeout(shakeTimer.current);
    },
    [],
  );

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

  // Escape closes the font samples; a tap elsewhere is the overlay below.
  useEffect(() => {
    if (!fontsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFontsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fontsOpen]);

  // The sheet's other way out (the tab and a swipe down its handle are the two
  // on the mat itself), and the tab's ride up with it.
  useEffect(() => {
    if (!sheetOpen) {
      setTabLift(0);
      return;
    }
    // `rect.bottom` is already lifted by whatever is applied, so add it back to
    // get where the tab rests: re-measuring on a resize then can't compound.
    const measure = () => {
      const rect = stickerTab.current?.getBoundingClientRect();
      if (!rect) return;
      const perch = window.innerHeight - SHEET_H + TAB_PERCH;
      setTabLift((lift) => Math.max(0, rect.bottom + lift - perch));
    };
    measure();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
    };
  }, [sheetOpen]);

  // The fade's second half: flip to transparent one PAINTED frame after the
  // ghost mounts. One rAF isn't enough — it can run before the browser has
  // taken a style recalc of the opaque mount, and then nothing transitions.
  useEffect(() => {
    if (!ghost || ghost.out) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() =>
        setGhost((g) => g && { ...g, out: true }),
      );
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [ghost]);

  // Leave the element where it was, fading, after it has gone from the note.
  function showGhost(el: NoteElement) {
    clearTimeout(ghostTimer.current);
    ghostId.current += 1;
    setGhost({ el, out: false, id: ghostId.current });
    ghostTimer.current = setTimeout(() => setGhost(null), GHOST_MS + 80);
  }

  // Nothing more fits on the note: rock the tool in its slot for a moment, so
  // the pointer-down that drew nothing is not silence.
  function shakeTool() {
    setShaking(true);
    clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShaking(false), SHAKE_MS);
  }

  function apply(next: NoteContent) {
    contentRef.current = next;
    setContent(next);
  }

  // A pad with no note on the mat tears a fresh sheet off; with a note already
  // there it swaps the stock under the content. Both wait for the objects to
  // stop moving — mid-crumple there is no note to swap the paper under yet.
  function takeSheet(colour: PaperColour) {
    if (!fanSettled || crumpling) return;
    setFanned(false);
    if (content) {
      apply({ ...content, colour });
      return;
    }
    apply({ ...emptyNote(), colour });
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
      apply({ ...emptyNote(), colour: contentRef.current?.colour ?? colour });
      setTearing(true);
    }, CRUMPLE_MS);
  }

  // Tapping a tool picks it up; tapping the one in your hand (or any other
  // tool) puts it down. Selection is a hand-mode idea, so it goes with the hand.
  function pickUp(tool: Exclude<Held, null>) {
    setHeld((h) => (h === tool ? null : tool));
    setSelected(-1);
    setFontsOpen(false);
    hideCursorTool();
  }

  // --- the paper -----------------------------------------------------------
  // Client → note coordinates. NotePaper has no fastener headroom, so the
  // paper's box IS 0..CANVAS on both axes. The one mapping in the editor: the
  // paper's own gestures come through `toNote`, a peeled sticker lands through
  // `dropSticker`, and T6 folds the note's rotation in here for both.
  function clientToNote(clientX: number, clientY: number): [number, number] {
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return [0, 0];
    return [
      clampCoord(((clientX - rect.left) / rect.width) * CANVAS),
      clampCoord(((clientY - rect.top) / rect.height) * CANVAS),
    ];
  }

  function toNote(e: ReactPointerEvent): [number, number, number] {
    const [x, y] = clientToNote(e.clientX, e.clientY);
    return [x, y, e.pressure || 0.5];
  }

  // A sticker released off the sheet: it sticks only where it was dropped, and
  // only if that is on the paper. Nothing else about the editor moves — the
  // selection, the held tool and the mode are all somebody else's gesture.
  function dropSticker(
    emoji: StickerEl["emoji"],
    clientX: number,
    clientY: number,
  ): boolean {
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height || tearing || crumpling) return false;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    )
      return false;
    // Same as a tap on the paper: the open box commits first, then this drop
    // does its own job on what that left behind.
    if (textDraft) commitText();
    const live = contentRef.current;
    if (!live) return false;
    const [x, y] = clientToNote(clientX, clientY);
    apply(
      addElement(live, { type: "sticker", x, y, emoji, scale: 1, rotation: 0 }),
    );
    return true;
  }

  // Nothing on the paper wants the browser's default pointer-down: no text
  // selection, and no compatibility mousedown to move focus off the open text
  // box (the paper isn't focusable, so that blur is pure loss).
  function onPaperDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!content || tearing || crumpling) return;
    if (busy() && activeId.current !== e.pointerId) return;
    activeId.current = e.pointerId;
    setFontsOpen(false);
    // The text box never takes the pointer (it is pointer-events-none), so a
    // pointer-down on the paper is always a tap away from it: commit, then let
    // this tap do its own job.
    if (textDraft) commitText();
    const live = contentRef.current ?? content; // commitText may have grown it
    const [x, y, p] = toNote(e);
    // Keep the gesture on the paper even when the pointer wanders off it. The
    // guard is for jsdom (no pointer capture at all) and for a pointer id that
    // is no longer live, which throws rather than returning.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // not a live pointer — carry on without capture
    }

    if (held === "eraser") {
      rubbingRef.current = true;
      setUsing(true);
      rub(x, y);
      return;
    }
    if (isInk(held)) {
      // Full note: `addElement` would silently drop whatever this gesture
      // draws, so don't start one — shake the tool instead.
      if (live.elements.length >= MAX_ELEMENTS) {
        shakeTool();
        return;
      }
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
    const hits = hitTestAll(live, x, y);
    const next = cycleHit(hits, selected);
    setSelected(next);
    dragRef.current = next < 0 ? null : { index: next, x, y };
  }

  function onPaperMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy() && activeId.current !== e.pointerId) return;
    followCursorTool(e);
    const live = contentRef.current;
    if (!live) return;

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
    apply(moveElement(live, drag.index, dx, dy));
  }

  function onPaperUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy() && activeId.current !== e.pointerId) return;
    activeId.current = null;
    // iOS Safari raises the keyboard only for a focus() inside the gesture that
    // asked for it — a frame later and the box is live with no keyboard under
    // it. Keep this call synchronous here, and check it on a real phone.
    if (textDraft) {
      textRef.current?.focus();
      return;
    }
    setUsing(false);
    rubbingRef.current = false;

    const draft = draftRef.current;
    if (draft) {
      draftRef.current = null;
      // A dot (single point) draws nothing via perfect-freehand — needs ≥2, so
      // a tap in draw mode leaves no mark.
      if (draft.points.length >= 2 && contentRef.current)
        apply(addElement(contentRef.current, draft));
      forceRender();
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const live = contentRef.current;
    const el = live?.elements[drag.index];
    if (!live || !el) return;
    if (isOffNote(el)) {
      showGhost(el);
      apply(removeElement(live, drag.index));
      setSelected(-1);
      return;
    }
    const settled = settleElement(el);
    if (settled !== el) apply(updateElement(live, drag.index, settled));
  }

  // One rub of the eraser: whatever is under the nib goes, with a fade.
  function rub(x: number, y: number) {
    const live = contentRef.current;
    if (!live) return;
    const hit = hitTest(live, x, y);
    const el = live.elements[hit];
    if (!el) return;
    showGhost(el);
    apply(removeElement(live, hit));
  }

  function commitText() {
    const draft = textDraft;
    setTextDraft(null);
    const text = draft?.text.trim();
    if (!draft || !text || !contentRef.current) return; // empty adds nothing
    apply(addElement(contentRef.current, { ...draft, text }));
  }

  // --- the tool riding the cursor -----------------------------------------
  // Positioned by hand rather than by state: a pointermove per frame must not
  // re-render the note.
  function followCursorTool(e: ReactPointerEvent) {
    const el = cursorRef.current;
    if (!el || !tool) return;
    const [hx, hy] = tool.hotspot;
    el.style.opacity = "1";
    el.style.transform = `translate(${e.clientX - hx}px, ${e.clientY - hy}px)`;
  }

  function hideCursorTool() {
    const el = cursorRef.current;
    if (el) el.style.opacity = "0";
  }

  const draft = draftRef.current;
  // The image of the tool in your hand, for a fine pointer to carry.
  const tool = held ? heldTool(held) : null;
  // The live stroke and the open text box are elements like any other, so they
  // render through the same NotePaper path the committed note uses — which is
  // what makes typing WYSIWYG rather than an overlay that lies about its size.
  const shown =
    content && (textDraft ?? draft)
      ? addElement(content, (textDraft ?? draft) as NoteElement)
      : content;
  const selectedEl = selected >= 0 ? content?.elements[selected] : undefined;

  return (
    <div className="absolute inset-0 select-none">
      {/* the sheet: bare paper, centred, clear of the strip */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-32">
        {shown && (
          <div
            // The sticker sheet takes the bottom of the mat, so the note moves
            // up out of its way and stays whole.
            // ponytail: one fixed shrink, not a measurement — measured in
            // Chrome to clear the sheet and its tab from 320x568 up, without
            // reaching the mat's tape label. Measure if the sheet ever grows.
            className={STILL}
            style={{
              transform: sheetOpen ? "translateY(-12%) scale(.72)" : "none",
              transition: `transform ${SHEET_MS}ms ${EASE_OUT}`,
            }}
          >
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
                  key={ghost.id}
                  viewBox={`0 0 ${CANVAS} ${CANVAS}`}
                  className={`${STILL} pointer-events-none absolute inset-0 h-full w-full`}
                  aria-hidden="true"
                  style={{
                    opacity: ghost.out ? 0 : 1,
                    transition: `opacity ${GHOST_MS}ms linear`,
                  }}
                >
                  <title>rubbed out</title>
                  {renderElement(ghost.el, 0)}
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
          </div>
        )}
      </div>

      {/* a fanned stack, or the font samples, close on a tap anywhere else */}
      {fanned && (
        <button
          type="button"
          aria-label="Close the pads"
          className="absolute inset-0 z-20 h-full w-full cursor-default border-0 bg-transparent p-0"
          onClick={() => setFanned(false)}
        />
      )}
      {fontsOpen && (
        <button
          type="button"
          aria-label="Close the font samples"
          className="absolute inset-0 z-20 h-full w-full cursor-default border-0 bg-transparent p-0"
          onClick={() => setFontsOpen(false)}
        />
      )}

      {/* the desk strip: the mat's bottom edge, where the objects lie. Three
          groups — left: the pads; centre: the markers and the draw/write
          control; right: T5's sticker tab, the eraser, then the bin. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-1 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
            className="-inset-1.5 absolute z-30 min-h-12 min-w-12 border-0 bg-transparent p-0"
          />
        </div>

        {/* Below `sm` the markers wrap onto their own row UNDER the rest, which
            puts the objects you reach for most nearest the thumb. */}
        <div className="flex min-h-12 flex-1 items-end justify-center gap-1 max-sm:order-last max-sm:basis-full max-sm:justify-center">
          {INKS.map((ink) => (
            <ToolSlot
              key={ink}
              label={`${held === ink ? "Put down" : "Pick up"} the ${ink} marker`}
              held={held === ink}
              shake={shaking && held === ink}
              onClick={() => pickUp(ink)}
            >
              <MarkerBody ink={ink} held={held === ink} using={using} />
            </ToolSlot>
          ))}
          <ModeControl
            ink={isInk(held) ? held : null}
            mode={mode}
            font={font}
            fontsOpen={fontsOpen}
            onMode={(m) => {
              setMode(m);
              setFontsOpen(m === "write");
            }}
            onFont={(f) => {
              setFont(f);
              setFontsOpen(false);
            }}
          />
        </div>

        <div className="flex shrink-0 items-end gap-1">
          {/* the tab rides above the sheet it pulls up (z), so it is still the
              way to put it away */}
          <div
            data-slot="sticker-tab"
            className="relative z-50 min-h-12 min-w-12 shrink-0"
          >
            <StickerTab
              ref={stickerTab}
              open={sheetOpen}
              lift={tabLift}
              onClick={() => setSheetOpen((open) => !open)}
            />
          </div>
          <div data-slot="eraser" className="shrink-0">
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

      <StickerSheet
        open={sheetOpen}
        // Nothing to stick it to, or no room left: the sticker stays put. The
        // tool shake belongs to the tool in your hand, and peeling holds none.
        canPeel={!!content && content.elements.length < MAX_ELEMENTS}
        onDrop={dropSticker}
        onClose={() => setSheetOpen(false)}
      />

      {/* the held tool, riding a mouse with its nib on the hotspot. Parked
          off-screen until the pointer is over the paper. */}
      {fine && tool && (
        <div
          ref={cursorRef}
          aria-hidden="true"
          className={`${STILL} pointer-events-none fixed top-0 left-0 z-50 opacity-0`}
          style={{ transition: "opacity 140ms" }}
        >
          <div style={tool.style}>{tool.body}</div>
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
function selectionRect(el: NoteElement) {
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
