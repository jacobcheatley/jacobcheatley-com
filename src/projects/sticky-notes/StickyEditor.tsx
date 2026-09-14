import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { capturePointer, EASE_OUT, SHEET_MS, STILL, TAB_PERCH } from "./desk";
import {
  Bin,
  BinSlip,
  DESK_GAP,
  ERASER_SLOT,
  EraserBody,
  heldTool,
  MARKER_SLOT,
  MarkerBody,
  type Mode,
  ModeControl,
  PAPER_SIDE,
  PadChooser,
  SHAKE_MS,
  StickerTab,
  TapeLabel,
  ToolSlot,
} from "./desk-objects";
import {
  addElement,
  angleOf,
  bounds,
  type Corner,
  clampCoord,
  clientToNoteCoords,
  curlCorner,
  curlFromPointer,
  emptyNote,
  fixedElement,
  grabPlacing,
  HANDLE_TOUCH,
  hitTest,
  isOffNote,
  moveElement,
  type Element as NoteElement,
  noteSide,
  outsideSpinDead,
  type PlacingGrip,
  removeElement,
  rotationFromHandle,
  settleElement,
  turnNote,
  widthFromPointer,
} from "./note-editor";
import { loadFont } from "./note-fonts";
import {
  caretAt,
  caretRect,
  gripMark,
  handleMarks,
  outlineRect,
} from "./note-overlay";
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
  type PaperColour,
} from "./note-schema";
import { flyToLanding, PinUp } from "./pin-up";
import { SHEET_H, StickerSheet } from "./StickerSheet";

// What lies on the cutting mat (#73, #74, #81): the pad chooser while there is
// no note, the sheet torn off a pad, the bin, and the stationery — four
// markers, the draw/write control and the eraser. The mat surface itself is
// StickyMat; this is the island it lazy-loads, and the file the later tickets
// grow into: T5 hangs the sticker sheet off the reserved tab slot, T6 rotates
// the note and adds on-note handles, T7 the pinning phase.
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

// ponytail: the crumple flies to a fixed viewport-relative point (the bin's
// corner) rather than the bin's measured box. Measure it if the bin ever moves
// off the strip's right end. The tear-off is measured: it starts on its pad.
const CRUMPLE_TO = "translate(34vw, 38vh) rotate(260deg) scale(.06)";

type StrokeEl = Extract<NoteElement, { type: "stroke" }>;
type TextEl = Extract<NoteElement, { type: "text" }>;
type StickerEl = Extract<NoteElement, { type: "sticker" }>;
// What can be placed (#80): a stroke is drawn where it lies, never placed.
type Placing = TextEl | StickerEl;
// A drag on the element being placed: the part taken hold of, where, and the
// element as it was then — every move is measured from there.
type PlacingDrag = {
  grip: PlacingGrip;
  from: [number, number];
  start: Placing;
};
// Where a torn-off sheet starts: its pad's centre, seen from where it lands, in
// px.
type Tear = { dx: number; dy: number };
// Nothing held is hand mode — the absence of a tool, not a tool of its own.
type Held = Ink | "eraser" | null;

const isInk = (held: Held): held is Ink => held !== null && held !== "eraser";

export default function StickyEditor({
  initialContent = null,
  up = true,
  landing,
  onLanding,
}: {
  // Tests seed a half-built note; the UI always starts from a torn-off sheet.
  initialContent?: NoteContent | null;
  // Whether the mat is up. The island stays mounted under a mat that has gone
  // down, and must not keep listening to the wall's presses and keys.
  up?: boolean;
  // The pinning phase (#77): the note as it lies on the wall, while it does.
  // The page owns it (the wall shows it); this island puts it there.
  landing?: NoteContent;
  onLanding?: (note: NoteContent | undefined) => void;
}) {
  const [content, setContent] = useState<NoteContent | null>(initialContent);
  // A pointermove's state update has not necessarily landed by the time the
  // next pointer event runs, and a drag has to read back what the previous
  // move wrote: settle-or-delete on release needs the moved element, and a rub
  // needs the elements the last rub left. This ref is the live note; `apply`
  // is the only way content changes, so the two can't drift.
  const contentRef = useRef(content);
  contentRef.current = content;
  // `tearing` is where a fresh sheet starts, over the pad it came off: it is
  // parked there for a frame, and dropping it lets the transition carry the
  // sheet to the middle of the mat. `crumpling` is the same trick in reverse,
  // into the bin.
  const [tearing, setTearing] = useState<Tear | null>(null);
  const [crumpling, setCrumpling] = useState(false);
  // The bin's slip is up, asking whether the note may go (#81).
  const [binSlipOpen, setBinSlipOpen] = useState(false);

  const [held, setHeld] = useState<Held>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [font, setFont] = useState<Font>("casual"); // the editor's default
  // The font samples pop up over the mat: opened by the "Aa" side of the
  // rocker, closed by a tap elsewhere, Escape or a choice.
  const [fontsOpen, setFontsOpen] = useState(false);
  // The sticker sheet is independent of what is in your hand: opening it neither
  // puts a marker down nor picks anything up.
  const [sheetOpen, setSheetOpen] = useState(false);
  // Placing (#80): a new text box or sticker, on the note but not yet part of
  // it — it can be moved, turned and (text) widened until a press anywhere
  // else fixes it. The ref is the live one, for the same reason as contentRef.
  const [placing, setPlacing] = useState<Placing | null>(null);
  const placingRef = useRef(placing);
  placingRef.current = placing;
  // A finger leaves the tool docked on the mat, so the dock has to show the
  // stroke happening; a mouse carries the tool itself.
  const [using, setUsing] = useState(false);
  // While the note is being turned its tilt has to sit under the finger, so
  // the tilt's own transition (the tear-off flight) is off for the gesture.
  const [turning, setTurning] = useState(false);
  // The bottom corner being peeled, or the one a mouse is hovering over: it
  // shows its grip on the sheet.
  const [gripCorner, setGripCorner] = useState<Corner | null>(null);
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

  // Where the next glyph would land, in note units. Without a caret there is
  // no telling where you are typing (#74) — and it is measured off the glyphs
  // the renderer drew, so it cannot drift from the text it follows.
  const [caret, setCaret] = useState<{ x: number; y: number } | null>(null);
  // Bumped when the placing box's webfont lands: one more measurement, nothing
  // else.
  const [caretTick, setCaretTick] = useState(0);

  // How far the sticker tab has to rise to perch on the open sheet's corner.
  // Measured rather than assumed: where the tab rests is the strip's business,
  // and the strip's layout changes with the viewport.
  const [tabLift, setTabLift] = useState(0);

  // "pin it up": where the keyboard comes back to when the note does
  const pinButton = useRef<HTMLButtonElement>(null);
  const stickerTab = useRef<HTMLButtonElement>(null);
  const rocker = useRef<HTMLDivElement>(null);
  const firstPad = useRef<HTMLButtonElement>(null);
  const binButton = useRef<HTMLButtonElement>(null);
  const binYes = useRef<HTMLButtonElement>(null);
  // the bin and its slip together: a press in here is not a press elsewhere
  const binCorner = useRef<HTMLDivElement>(null);
  // the box the sheet is centred in, so where a torn-off sheet lands
  const stage = useRef<HTMLDivElement>(null);
  const crumpleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const paperRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Transient pointer state lives in refs (no re-render on read); the live
  // stroke uses forceRender so the note grows as you draw.
  const draftRef = useRef<StrokeEl | null>(null);
  const rubbingRef = useRef(false);
  // Turning the note (#76, #79). The angle is taken in CLIENT space about the
  // paper's centre: taken in note units it would be measured through the very
  // rotation it is setting, and the paper would chase its own tail at half
  // speed. `start` stays null while a press near the centre has no angle yet.
  const spinRef = useRef<{
    centre: [number, number];
    from: number;
    start: number | null;
  } | null>(null);
  // Peeling a corner: which, the curl it had and where it was taken hold of —
  // the pull is read from there, so grabbing the flap doesn't move the fold.
  const curlRef = useRef<{
    corner: Corner;
    start: number;
    from: [number, number];
  } | null>(null);
  // Two fingers turn the note, whatever lies under them. `from` is where the
  // second finger landed, seen from the first; `rotation` is the note's then.
  const pinchRef = useRef<{
    a: number;
    b: number;
    from: [number, number];
    rotation: number;
  } | null>(null);
  // Where every pointer that came down on the paper is now, in client
  // coordinates: a two-finger gesture is the only thing that needs to know
  // about a pointer other than its own.
  const points = useRef(new Map<number, [number, number]>());
  const ghostTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ghostId = useRef(0);
  const placingDragRef = useRef<PlacingDrag | null>(null);
  // One gesture at a time: while a stroke, rub, turn, peel or placing drag is
  // live, moves from any other pointer are ignored rather than allowed to steal
  // it. A second finger coming DOWN is the exception: it takes over
  // (startPinch).
  const activeId = useRef<number | null>(null);
  const busy = () =>
    draftRef.current !== null ||
    rubbingRef.current ||
    spinRef.current !== null ||
    curlRef.current !== null ||
    placingDragRef.current !== null;
  // Every one-pointer gesture ends here, whether it was lifted or a second
  // finger took it over: one place, so no half of a gesture outlives it.
  function endGesture() {
    draftRef.current = null;
    rubbingRef.current = false;
    placingDragRef.current = null;
    spinRef.current = null;
    curlRef.current = null;
    setUsing(false);
    setTurning(false);
    setGripCorner(null);
  }
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // Two frames, not one: a single rAF can run before the browser has taken a
  // style recalc of the just-parked sheet, and the sheet then appears in the
  // middle of the mat without ever having travelled.
  useEffect(() => {
    if (!tearing) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setTearing(null));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [tearing]);

  // No note: the whole mat is the pad chooser, so the keyboard starts on it —
  // once the mat is up, since nothing on a mat that has gone down takes focus.
  const choosing = content === null;
  useEffect(() => {
    if (choosing && up) firstPad.current?.focus();
  }, [choosing, up]);

  // The bin's question: the tick has the keyboard; the cross, Escape or a
  // press anywhere else keeps the note, and that press still does its own job.
  // A press on the bin itself is left to the bin's click (binIt), so the one
  // tap is one answer. Escape is caught first, like placing's, so it doesn't
  // also put the sticker sheet away. A mat taken down mid-question just drops
  // it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keepIt reads only a ref and a state setter, so the copy from the render that armed this is as good as the latest.
  useEffect(() => {
    if (!binSlipOpen) return;
    if (!up) {
      setBinSlipOpen(false);
      return;
    }
    binYes.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      keepIt();
    };
    const away = (e: PointerEvent) => {
      if (!binCorner.current?.contains(e.target as Node)) keepIt();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", away);
    };
  }, [binSlipOpen, up]);

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

  // The samples close on Escape, or on a press anywhere but the rocker — and
  // that press goes on to do its own job. A backdrop that closed them by
  // swallowing the press cost a whole tap: you picked a font, tapped the paper,
  // and nothing was placed (#74).
  useEffect(() => {
    if (!fontsOpen || !up) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFontsOpen(false);
    };
    const away = (e: PointerEvent) => {
      if (!rocker.current?.contains(e.target as Node)) setFontsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", away);
    };
  }, [fontsOpen, up]);

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
    // A mat that has gone down leaves Escape to the wall; it measures again on
    // its way back up.
    if (!up) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
    };
  }, [sheetOpen, up]);

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

  // The caret is measured off laid-out glyphs, so a webfont that resolves after
  // the first paint has to be measured again — otherwise the caret sits on the
  // `wrapLines` estimate until the next keystroke.
  const boxFont = placing?.type === "text" ? placing.font : undefined;
  useEffect(() => {
    if (!boxFont) return;
    let live = true;
    loadFont(boxFont).then(() => {
      if (live) setCaretTick((n) => n + 1);
    });
    return () => {
      live = false; // the box was fixed (or thrown away) before the font landed
    };
  }, [boxFont]);

  // Before the browser paints the glyph, not after: the caret must not trail a
  // frame behind the letter it follows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: caretTick is the ask for one more measurement, not a value this reads.
  useLayoutEffect(() => {
    if (placing?.type !== "text") {
      setCaret(null);
      return;
    }
    // where the box sits in the note the renderer just drew
    setCaret(
      caretAt(
        paperRef.current,
        placing,
        contentRef.current?.elements.length ?? 0,
      ),
    );
    // The caret only ever sits at the end, so the textarea's own cursor goes
    // there too — otherwise Home or a tap inside the box types somewhere the
    // caret isn't. ponytail: end of text only, so a box can only be typed into
    // at its end. Upgrade: draw the caret at `selectionStart` (one more
    // `getEndPositionOfChar`, on the tspan holding it) and stop pinning the
    // selection here.
    const box = textRef.current;
    box?.setSelectionRange(box.value.length, box.value.length);
  }, [placing, caretTick]);

  // While something is being placed, a press anywhere off the paper fixes it
  // first: the mat, the sheet, or a tray object before its own click does (the
  // keyboard has no press, so each of those handlers fixes it too). The paper
  // judges its own presses by geometry (onPaperDown). Spared, for a text box
  // only: the rocker, whose samples change the box, whose "Aa" brings them
  // back up, and whose draw half fixes the box by its own click. Escape throws
  // it away — in the capture phase, so it is not also the Escape that puts the
  // sticker sheet or the samples away. None of this outlives the mat: taken
  // down (Back) mid-placing, the element is kept like the rest of the note, and
  // the wall has its keys back.
  const isPlacing = placing !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fixPlacing and applyPlacing read only refs and state setters, so the copies from the render that armed this are as good as the latest.
  useEffect(() => {
    if (!isPlacing) return;
    if (!up) {
      fixPlacing();
      return;
    }
    const away = (e: PointerEvent) => {
      const at = e.target as Node;
      if (paperRef.current?.contains(at)) return;
      if (placingRef.current?.type === "text" && rocker.current?.contains(at))
        return;
      fixPlacing();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      applyPlacing(null);
    };
    document.addEventListener("pointerdown", away);
    // `true`: listen in the capture phase, before any other keydown listener
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [isPlacing, up]);

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

  function apply(next: NoteContent | null) {
    contentRef.current = next;
    setContent(next);
  }

  function applyPlacing(next: Placing | null) {
    placingRef.current = next;
    setPlacing(next);
  }

  // A pad on the chooser tears a fresh sheet off (#81), and that colour is the
  // note's for good. The sheet starts square over the pad it came off — a pad
  // is the paper's own size, so only the move is measured — and lands with
  // its tilt.
  function takeSheet(colour: PaperColour, pad: HTMLElement) {
    if (content) return;
    const note = { ...emptyNote(), colour };
    const from = pad.getBoundingClientRect();
    const to = stage.current?.getBoundingClientRect();
    const dx = to ? from.left + from.width / 2 - (to.left + to.width / 2) : 0;
    const dy = to ? from.top + from.height / 2 - (to.top + to.height / 2) : 0;
    apply(note);
    setTearing({ dx, dy });
  }

  // The bin (#81): a note with anything on it asks first, a blank one goes
  // straight in. What is being placed is fixed first, so it counts. Tapped
  // again while it asks, the bin is the answer "keep".
  function binIt() {
    if (binSlipOpen) {
      keepIt();
      return;
    }
    fixPlacing();
    const live = contentRef.current;
    if (!live || crumpling) return;
    if (live.elements.length > 0) setBinSlipOpen(true);
    else crumple();
  }

  // One crumple at a time: a second "Bin it" in the same breath (before a
  // re-render has taken the tick away) would start a second timer, and only the
  // last is cleared if the editor unmounts. The ref, not `crumpling`: state read
  // here can be a render behind.
  function crumple() {
    if (crumpleTimer.current !== undefined) return;
    setBinSlipOpen(false);
    setCrumpling(true);
    crumpleTimer.current = setTimeout(() => {
      crumpleTimer.current = undefined;
      setCrumpling(false);
      clearMat();
    }, CRUMPLE_MS);
  }

  function keepIt() {
    setBinSlipOpen(false);
    binButton.current?.focus();
  }

  // No note on the mat: back to the pad chooser. Nothing stays in hand or up,
  // so the next sheet starts in hand mode like the first.
  function clearMat() {
    apply(null);
    setHeld(null);
    setSheetOpen(false);
    setFontsOpen(false);
  }

  // "pin it up": the note leaves the mat for its slot on the wall. It goes as it
  // is, bare paper — the fastener is chosen once it has landed.
  function pinUp() {
    fixPlacing(); // what is being placed goes up with it
    const live = contentRef.current;
    if (!live || crumpling) return;
    const from = paperRef.current?.getBoundingClientRect();
    // The wall has to lay the landed note out before there is anywhere to fly
    // it to, so this render happens now rather than after the handler.
    flushSync(() => onLanding?.({ ...live, fastener: "none" }));
    flyToLanding(from);
  }

  // Tapping a tool picks it up; tapping the one in your hand (or any other
  // tool) puts it down.
  function pickUp(tool: Exclude<Held, null>) {
    fixPlacing();
    setHeld((h) => (h === tool ? null : tool));
    setFontsOpen(false);
    hideCursorTool();
  }

  // --- the paper -----------------------------------------------------------
  // Client → note coordinates. NotePaper has no fastener headroom, so the
  // paper's box IS 0..CANVAS on both axes. The one mapping in the editor: the
  // paper's own gestures come through `toNote`, a peeled sticker lands through
  // `dropSticker`. The note renders tilted (#76), so every pointer comes back
  // through that rotation here — the maths itself is pure, in note-editor.
  function clientToNote(clientX: number, clientY: number): [number, number] {
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return [0, 0];
    const deg = contentRef.current?.rotation ?? 0;
    const [x, y] = clientToNoteCoords(
      [clientX, clientY],
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      noteSide(rect.width, deg),
      deg,
    );
    return [clampCoord(x), clampCoord(y)];
  }

  function toNote(e: ReactPointerEvent): [number, number, number] {
    const [x, y] = clientToNote(e.clientX, e.clientY);
    return [x, y, e.pressure || 0.5];
  }

  // A sticker released off the sheet: dropped on the paper, it lands there to
  // be placed (#80) — moved and turned until a press elsewhere sticks it.
  // Nothing else about the editor moves — the held tool and the mode are
  // somebody else's gesture.
  function dropSticker(
    emoji: StickerEl["emoji"],
    clientX: number,
    clientY: number,
  ): boolean {
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height || tearing || crumpling) return false;
    // On the paper is a question in note units, not screen ones: a tilted sheet
    // does not fill its own bounding box, and the corners it leaves over are
    // mat, not paper.
    const [x, y] = clientToNote(clientX, clientY);
    if (x < 0 || x > CANVAS || y < 0 || y > CANVAS) return false;
    // The peel's own pointer-down fixed whatever was being placed; this is for
    // a second finger that started placing something while the first carried
    // the sticker.
    fixPlacing();
    // Fixing it may have taken the last free slot, and `addElement` is a
    // silent no-op on a full note: refuse the drop so the sheet flies the
    // sticker home instead of swallowing it.
    const live = contentRef.current;
    if (!live || live.elements.length >= MAX_ELEMENTS) return false;
    applyPlacing({ type: "sticker", x, y, emoji, scale: 1, rotation: 0 });
    return true;
  }

  // Nothing on the paper wants the browser's default pointer-down: no text
  // selection, and no compatibility mousedown to move focus off the open text
  // box (the paper isn't focusable, so that blur is pure loss).
  function onPaperDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!content || tearing || crumpling) return;
    // A second finger never joins the first one's gesture: it takes it over.
    if (activeId.current !== null && activeId.current !== e.pointerId) {
      startPinch(e);
      return;
    }
    activeId.current = e.pointerId;
    points.current.set(e.pointerId, [e.clientX, e.clientY]);
    setFontsOpen(false);
    const live = contentRef.current ?? content;
    const [x, y, p] = toNote(e);
    // Keep the gesture on the paper even when the pointer wanders off it.
    capturePointer(e);

    // Placing (#80): the element being placed takes a press on its handles or
    // its body. A press anywhere else fixes it and does nothing more — no
    // stroke, no second box, no turn.
    const el = placingRef.current;
    if (el) {
      const grip = placingGrip(el, x, y);
      if (grip) placingDragRef.current = { grip, from: [x, y], start: el };
      else fixPlacing();
      return;
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
        applyPlacing({
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

    // Hand mode: a placed element is never taken hold of (#79), so a press is
    // only ever the paper's own — a bottom corner peels it, anywhere else on it
    // (over what is drawn there too) turns it.
    const corner = curlCorner(live.curl, x, y);
    if (corner) {
      curlRef.current = { corner, start: live.curl[corner], from: [x, y] };
      setGripCorner(corner);
      return;
    }
    startSpin(e, x, y);
  }

  // The second finger. On a live stroke it drops the draft (a second finger is
  // never more ink); either way the two fingers turn the note, whatever lies
  // under them.
  function startPinch(e: ReactPointerEvent) {
    const first = activeId.current;
    const live = contentRef.current;
    const a = first === null ? undefined : points.current.get(first);
    if (!live || first === null || !a) return;
    // Two fingers never twist what is being placed, nor turn the note out from
    // under a drag on it; and a held tool that isn't mid-stroke (the eraser, a
    // marker writing) keeps to one finger.
    if (placingDragRef.current || (held !== null && draftRef.current === null))
      return;
    endGesture();
    capturePointer(e);
    const b: [number, number] = [e.clientX, e.clientY];
    points.current.set(e.pointerId, b);
    pinchRef.current = {
      a: first,
      b: e.pointerId,
      from: [b[0] - a[0], b[1] - a[1]],
      rotation: live.rotation,
    };
    setTurning(true);
    forceRender();
  }

  // Both fingers, every move: how far round the second has swung, seen from
  // the first, is how far the note turns.
  function pinchMove(e: ReactPointerEvent) {
    const pinch = pinchRef.current;
    const live = contentRef.current;
    if (!pinch || !live) return;
    if (e.pointerId !== pinch.a && e.pointerId !== pinch.b) return;
    points.current.set(e.pointerId, [e.clientX, e.clientY]);
    const a = points.current.get(pinch.a);
    const b = points.current.get(pinch.b);
    if (!a || !b) return;
    const now: [number, number] = [b[0] - a[0], b[1] - a[1]];
    const turned = angleOf([0, 0], now) - angleOf([0, 0], pinch.from);
    apply({ ...live, rotation: turnNote(pinch.rotation, turned) });
  }

  // Take hold of the note at (x, y) in note units: from here on the rotation
  // follows how far the pointer has swept round the paper's centre.
  function startSpin(e: ReactPointerEvent, x: number, y: number) {
    const rect = paperRef.current?.getBoundingClientRect();
    const live = contentRef.current;
    if (!rect || !live) return;
    const centre: [number, number] = [
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    ];
    spinRef.current = {
      centre,
      from: live.rotation,
      start: outsideSpinDead(x, y)
        ? angleOf(centre, [e.clientX, e.clientY])
        : null,
    };
    setTurning(true);
  }

  // The swept angle, applied to the note the gesture started from. Moves near
  // the centre are ignored; a turn pressed there takes its starting angle from
  // the first move out, so the note doesn't jump.
  function spinTo(e: ReactPointerEvent) {
    const spin = spinRef.current;
    const live = contentRef.current;
    if (!spin || !live) return;
    const [x, y] = toNote(e);
    if (!outsideSpinDead(x, y)) return;
    const at = angleOf(spin.centre, [e.clientX, e.clientY]);
    if (spin.start === null) {
      spin.start = at;
      return;
    }
    apply({ ...live, rotation: turnNote(spin.from, at - spin.start) });
  }

  function onPaperMove(e: ReactPointerEvent<HTMLDivElement>) {
    // Two fingers before one: the second pointer's moves are not the first
    // pointer's gesture, so the usual one-gesture guard would drop them.
    if (pinchRef.current) {
      pinchMove(e);
      return;
    }
    if (busy() && activeId.current !== e.pointerId) return;
    points.current.set(e.pointerId, [e.clientX, e.clientY]);
    followCursorTool(e);
    const live = contentRef.current;
    if (!live) return;
    if (!busy()) {
      // A mouse can hover, so a bottom corner lifts under it before it is
      // pressed (#69). A finger can't: its press shows the same mark. Not
      // while something is being placed: a press there would only fix it.
      if (held === null && !placingRef.current && e.pointerType === "mouse") {
        const [x, y] = toNote(e);
        setGripCorner(curlCorner(live.curl, x, y));
      }
      return;
    }

    const placingDrag = placingDragRef.current;
    if (placingDrag) {
      const [x, y] = toNote(e);
      dragPlacing(placingDrag, x, y);
      return;
    }

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
    if (spinRef.current) {
      spinTo(e);
      return;
    }
    const curl = curlRef.current;
    if (!curl) return;
    const [x, y] = toNote(e);
    const { corner, start, from } = curl;
    apply({
      ...live,
      curl: {
        ...live.curl,
        [corner]: curlFromPointer(corner, start, from, [x, y]),
      },
    });
  }

  function onPaperUp(e: ReactPointerEvent<HTMLDivElement>) {
    points.current.delete(e.pointerId);
    const pinch = pinchRef.current;
    if (pinch) {
      // either finger leaving ends the gesture; the one still down starts
      // nothing new until it is lifted and put back
      if (e.pointerId !== pinch.a && e.pointerId !== pinch.b) return;
      pinchRef.current = null;
      activeId.current = null;
      endGesture();
      forceRender();
      return;
    }
    if (busy() && activeId.current !== e.pointerId) return;
    activeId.current = null;
    const draft = draftRef.current;
    const dragged = placingDragRef.current !== null;
    endGesture();
    // A sticker let go wholly off the paper goes back to its sheet (the sheet
    // never runs out, so there is nothing to fly home): nothing is added.
    const el = placingRef.current;
    if (dragged && el?.type === "sticker" && isOffNote(el)) {
      applyPlacing(null);
      return;
    }
    // iOS Safari raises the keyboard only for a focus() inside the gesture that
    // asked for it — a frame later and the box is live with no keyboard under
    // it. Keep this call synchronous here, and check it on a real phone. It
    // runs after every press on a box being placed, too: a keyboard put away
    // comes back up with the next touch on the box.
    if (placingRef.current) {
      textRef.current?.focus();
      return;
    }
    if (!draft) return;
    // A dot (single point) draws nothing via perfect-freehand — needs ≥2, so a
    // tap in draw mode leaves no mark.
    if (draft.points.length >= 2 && contentRef.current)
      apply(addElement(contentRef.current, draft));
    forceRender();
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

  // --- placing (#80) -------------------------------------------------------

  // Which part of the element being placed a press at (x, y) took hold of. The
  // reach is a thumb's, HANDLE_TOUCH px across, for every pointer, a mouse's
  // too; how many note units it covers depends on the size the sheet is drawn
  // right now.
  function placingGrip(el: Placing, x: number, y: number): PlacingGrip | null {
    const rect = paperRef.current?.getBoundingClientRect();
    const side = rect?.width
      ? noteSide(rect.width, contentRef.current?.rotation ?? 0)
      : CANVAS;
    return grabPlacing(el, x, y, (HANDLE_TOUCH / 2 / side) * CANVAS);
  }

  // One move of a drag on the element being placed, measured from where the
  // drag began and merged into the live element, so a letter typed mid-drag
  // isn't lost. A move is settled back into the stored range as it goes.
  function dragPlacing(drag: PlacingDrag, x: number, y: number) {
    const live = placingRef.current;
    if (!live) return;
    const { grip, from, start } = drag;
    if (grip === "move") {
      const moved = settleElement(moveElement(start, x - from[0], y - from[1]));
      applyPlacing({ ...live, x: moved.x, y: moved.y });
    } else if (grip === "corner") {
      applyPlacing({
        ...live,
        rotation: rotationFromHandle(start, from, [x, y]),
      });
    } else if (live.type === "text") {
      applyPlacing({ ...live, w: widthFromPointer(live, x, y) });
    }
  }

  // Placing ends here: the element goes onto the note for good. Safe to call
  // twice: one press can arrive by the document's pointer-down and then by the
  // handler it lands on.
  function fixPlacing() {
    const el = placingRef.current;
    if (!el) return;
    applyPlacing(null);
    const fixed = fixedElement(el);
    const live = contentRef.current;
    if (fixed && live) apply(addElement(live, fixed));
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

  // Off the paper: the tool stops riding the cursor, and a corner lifted only
  // because a mouse was over it settles back.
  function leavePaper() {
    hideCursorTool();
    if (!busy() && !pinchRef.current) setGripCorner(null);
  }

  const draft = draftRef.current;
  // The image of the tool in your hand, for a fine pointer to carry.
  const tool = held ? heldTool(held) : null;
  // The live stroke and the element being placed are elements like any other:
  // each joins the end of the note while it is being made.
  const shown = !content
    ? content
    : placing
      ? addElement(content, placing)
      : draft
        ? addElement(content, draft)
        : content;

  return (
    <div className="absolute inset-0 select-none">
      {/* the sheet: bare paper, centred, clear of the strip */}
      <div
        ref={stage}
        className="pointer-events-none absolute inset-x-0 top-0 bottom-32 flex items-center justify-center"
      >
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
              // Pinned up, the note is on the wall: the mat slides away bare,
              // and comes back up with it lying where it was.
              visibility: landing ? "hidden" : undefined,
            }}
          >
            <div
              ref={paperRef}
              data-colour={shown.colour}
              // in flight onto the mat or into the bin: it takes no marks
              aria-busy={tearing !== null || crumpling}
              className={`${STILL} pointer-events-auto relative touch-none`}
              onPointerDown={onPaperDown}
              onPointerMove={onPaperMove}
              onPointerUp={onPaperUp}
              onPointerCancel={onPaperUp}
              onPointerLeave={leavePaper}
              style={{
                width: PAPER_SIDE,
                aspectRatio: NOTE_PAPER_ASPECT_RATIO,
                filter: "drop-shadow(3px 9px 12px rgba(0,0,0,.45))",
                // the held tool IS the cursor over the paper
                cursor: fine && held ? "none" : undefined,
                ...noteMotion(tearing, crumpling, shown.rotation, turning),
              }}
            >
              <NotePaper content={shown} />

              {/* The overlay rides inside the rotated sheet, so everything on
                  it is drawn in plain note units and turns with the paper. It
                  never takes the pointer: the paper under it does. */}
              {(placing || gripCorner) && (
                <svg
                  viewBox={`0 0 ${CANVAS} ${CANVAS}`}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  aria-hidden="true"
                >
                  <title>grip, caret and handles</title>
                  {gripCorner && gripMark(gripCorner, shown.curl)}
                  {placing && outlineRect(placing)}
                  {placing && handleMarks(placing)}
                  {caret &&
                    placing?.type === "text" &&
                    caretRect(caret, placing)}
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
                  keystrokes, so it is invisible and never takes the pointer.
                  No onBlur: a phone putting its keyboard away blurs it, and
                  only a press elsewhere fixes the box (#80). */}
              {placing?.type === "text" && (
                <textarea
                  ref={textRef}
                  aria-label="Text box"
                  value={placing.text}
                  maxLength={MAX_TEXT_LEN}
                  onChange={(e) => {
                    const live = placingRef.current;
                    if (live?.type === "text")
                      applyPlacing({ ...live, text: e.target.value });
                  }}
                  className="pointer-events-none absolute resize-none border-0 bg-transparent p-0 opacity-0 outline-none"
                  style={textBoxStyle(placing)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* stuck along the mat's top edge, across from "← the wall" */}
      {content && (
        <TapeLabel
          ref={pinButton}
          onClick={pinUp}
          className="absolute top-3 right-3 z-40"
        >
          pin it up
        </TapeLabel>
      )}

      <PadChooser
        ref={firstPad}
        putAway={!choosing}
        torn={content?.colour ?? null}
        onTear={takeSheet}
      />

      {/* the desk strip: the mat's bottom edge, where the objects lie. ONE row
          at every width (#74) — two groups on the same edge: centre, the
          markers and the draw/write control; right, the sticker tab, the
          eraser, then the bin. Nothing wraps and nothing moves up: the room a
          narrow screen takes comes out of the space BETWEEN the markers, never
          out of the corner. While a pad is being chosen the strip is away
          below the mat's edge, and out of reach. */}
      <div
        data-slot="tray"
        inert={choosing}
        className={`absolute inset-x-0 bottom-0 flex items-end justify-between pb-[max(0.75rem,env(safe-area-inset-bottom))] ${STILL}`}
        style={{
          paddingInline: DESK_GAP,
          transform: choosing ? "translateY(110%)" : "none",
          transition: `transform ${TEAR_MS}ms ${EASE_OUT}`,
        }}
      >
        {/* The markers close up as the screen narrows: the gap is whatever room
            is left over, and at zero the SQUEEZE in MARKER_SLOT leans them on
            each other. The group keeps the middle of the strip either way. */}
        <div
          // min-w-0: on a screen narrower than the objects, the markers lean
          // further over each other rather than push the corners off the mat.
          className="flex min-w-0 flex-1 items-end justify-center"
          style={{ gap: DESK_GAP }}
        >
          {INKS.map((ink) => (
            <ToolSlot
              key={ink}
              label={`${held === ink ? "Put down" : "Pick up"} the ${ink} marker`}
              held={held === ink}
              shake={shaking && held === ink}
              slot={MARKER_SLOT}
              onClick={() => pickUp(ink)}
            >
              <MarkerBody ink={ink} held={held === ink} using={using} />
            </ToolSlot>
          ))}
          <ModeControl
            ref={rocker}
            ink={isInk(held) ? held : null}
            mode={mode}
            font={font}
            fontsOpen={fontsOpen}
            onMode={(m) => {
              // An ordinary tool press, so it fixes what is being placed —
              // except "Aa" on a text box, which only brings its samples back.
              if (m === "draw" || placingRef.current?.type !== "text")
                fixPlacing();
              setMode(m);
              setFontsOpen(m === "write");
            }}
            onFont={(f) => {
              setFont(f);
              setFontsOpen(false);
              // a box still being placed takes the new face at once
              const live = placingRef.current;
              if (live?.type === "text") applyPlacing({ ...live, font: f });
            }}
          />
        </div>

        <div className="flex shrink-0 items-end" style={{ gap: DESK_GAP }}>
          {/* the tab rides above the sheet it pulls up (z), so it is still the
              way to put it away */}
          <div data-slot="sticker-tab" className="relative z-50 shrink-0">
            <StickerTab
              ref={stickerTab}
              open={sheetOpen}
              lift={tabLift}
              onClick={() => {
                fixPlacing();
                setSheetOpen((open) => !open);
              }}
            />
          </div>
          <ToolSlot
            label={`${held === "eraser" ? "Put down" : "Pick up"} the eraser`}
            held={held === "eraser"}
            slot={ERASER_SLOT}
            onClick={() => pickUp("eraser")}
          >
            {/* `using` is "some tool is working"; EraserBody lifts for it only
                when the eraser is the tool in hand (#74) */}
            <EraserBody held={held === "eraser"} using={using} />
          </ToolSlot>
          {/* A press on the bin or its slip takes no focus, as on the rocker:
              otherwise a tap on the bin while the slip asks moves focus out
              of the slip, which closes it, and the bin's click asks again. */}
          <div
            ref={binCorner}
            className="relative shrink-0"
            onPointerDown={(e) => e.preventDefault()}
          >
            <Bin
              ref={binButton}
              onClick={binIt}
              disabled={!content || crumpling}
            />
            {binSlipOpen && (
              <BinSlip
                ref={binYes}
                onBin={crumple}
                onKeep={keepIt}
                onLeave={() => setBinSlipOpen(false)}
              />
            )}
          </div>
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

      {landing && onLanding && (
        <PinUp
          content={landing}
          onChange={onLanding}
          // The page stops holding a landed note, so the mat slides back up;
          // the note on it never had the fastener, so it comes back without.
          // Rendered now rather than after the handler: the mat is inert until
          // it is up again, and focus can't land on anything inside it.
          onBack={() => {
            flushSync(() => onLanding(undefined));
            pinButton.current?.focus();
          }}
          // sent: the mat is bare again for the next note
          onPinned={clearMat}
        />
      )}

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

// The sheet's own transform: the tilt it is stored with (#76), under whatever
// flight it is on. The tilt is the LAST transform in the list, so it turns the
// paper about its own centre whatever the flight did to it — and the pointer
// mapping reads that same centre back off the box.
function noteMotion(
  // where a sheet being torn off starts, for its first frame
  tearing: Tear | null,
  crumpling: boolean,
  rotation: number,
  turning: boolean,
): CSSProperties {
  const tilt = `rotate(${rotation}deg)`;
  if (crumpling)
    return {
      transform: `${CRUMPLE_TO} ${tilt}`,
      opacity: 0,
      transition: `transform ${CRUMPLE_MS}ms cubic-bezier(.5,0,.8,.35), opacity ${CRUMPLE_MS}ms ease-in`,
    };
  // Coming off its pad the sheet lifts — a touch bigger, its shadow thrown
  // further — and both settle as it lands (the paper's own shadow is inline).
  if (tearing)
    return {
      // square to the screen, as it lay on its pad: no tilt yet
      transform: `translate(${tearing.dx}px, ${tearing.dy}px) scale(1.06)`,
      filter: "drop-shadow(8px 26px 24px rgba(0,0,0,.35))",
      transition: "none",
    };
  return {
    transform: tilt,
    // A sheet being turned must sit under the finger, not ease towards it.
    transition: turning
      ? "none"
      : `transform ${TEAR_MS}ms ${EASE_OUT}, filter ${TEAR_MS}ms ${EASE_OUT}`,
  };
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
