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
  DESK_GAP,
  ERASER_SLOT,
  EraserBody,
  FAN_MS,
  heldTool,
  MARKER_SLOT,
  MarkerBody,
  type Mode,
  ModeControl,
  PAD,
  padStyle,
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
  hitTest,
  type Element as NoteElement,
  noteSide,
  outsideSpinDead,
  removeElement,
  turnNote,
} from "./note-editor";
import { loadFont } from "./note-fonts";
import { caretAt, caretRect, gripMark } from "./note-overlay";
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
import { flyToLanding, PinUp } from "./pin-up";
import { SHEET_H, StickerSheet } from "./StickerSheet";

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
  landing,
  onLanding,
}: {
  // Tests seed a half-built note; the UI always starts from a torn-off sheet.
  initialContent?: NoteContent | null;
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
  const [textDraft, setTextDraft] = useState<TextEl | null>(null);
  // A finger leaves the tool docked on the mat, so the dock has to show the
  // stroke happening; a mouse carries the tool itself.
  const [using, setUsing] = useState(false);
  // What the hand is doing to the paper, if anything: turning it, or peeling a
  // bottom corner — or the corner a mouse is hovering over. A corner shows its
  // grip on the sheet; while the note is being turned its tilt has to sit under
  // the finger, so the tilt's own transition (the tear-off flight) is off for
  // the gesture.
  const [grip, setGrip] = useState<null | "turn" | Corner>(null);
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
  // Bumped when the draft's webfont lands: one more measurement, nothing else.
  const [caretTick, setCaretTick] = useState(0);

  // How far the sticker tab has to rise to perch on the open sheet's corner.
  // Measured rather than assumed: where the tab rests is the strip's business,
  // and the strip's layout changes with the viewport.
  const [tabLift, setTabLift] = useState(0);

  const trigger = useRef<HTMLButtonElement>(null);
  // "pin it up": where the keyboard comes back to when the note does
  const pinButton = useRef<HTMLButtonElement>(null);
  const stickerTab = useRef<HTMLButtonElement>(null);
  const rocker = useRef<HTMLDivElement>(null);
  const firstPad = useRef<HTMLButtonElement>(null);
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
  // One gesture at a time: while a stroke, rub or drag is live, events from any
  // other pointer are ignored rather than allowed to steal it. (T6 turns a
  // second finger into a cancel.)
  const activeId = useRef<number | null>(null);
  const busy = () =>
    draftRef.current !== null ||
    rubbingRef.current ||
    spinRef.current !== null ||
    curlRef.current !== null;
  // Every one-pointer gesture ends here, whether it was lifted or a second
  // finger took it over: one place, so no half of a gesture outlives it.
  function endGesture() {
    draftRef.current = null;
    rubbingRef.current = false;
    spinRef.current = null;
    curlRef.current = null;
    setUsing(false);
    setGrip(null);
  }
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

  // The samples close on Escape, or on a press anywhere but the rocker — and
  // that press goes on to do its own job. A backdrop that closed them by
  // swallowing the press cost a whole tap: you picked a font, tapped the paper,
  // and nothing was placed (#74).
  useEffect(() => {
    if (!fontsOpen) return;
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

  // The caret is measured off laid-out glyphs, so a webfont that resolves after
  // the first paint has to be measured again — otherwise the caret sits on the
  // `wrapLines` estimate until the next keystroke.
  const draftFont = textDraft?.font;
  useEffect(() => {
    if (!draftFont) return;
    let live = true;
    loadFont(draftFont).then(() => {
      if (live) setCaretTick((n) => n + 1);
    });
    return () => {
      live = false; // the draft closed (or went) before the font landed
    };
  }, [draftFont]);

  // Before the browser paints the glyph, not after: the caret must not trail a
  // frame behind the letter it follows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: caretTick is the ask for one more measurement, not a value this reads.
  useLayoutEffect(() => {
    if (!textDraft) {
      setCaret(null);
      return;
    }
    // where the draft sits in the note the renderer just drew
    setCaret(
      caretAt(
        paperRef.current,
        textDraft,
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
  }, [textDraft, caretTick]);

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
    setCrumpling(true);
    crumpleTimer.current = setTimeout(() => {
      setCrumpling(false);
      // the live colour, not the one captured at the tap
      apply({ ...emptyNote(), colour: contentRef.current?.colour ?? colour });
      setTearing(true);
    }, CRUMPLE_MS);
  }

  // "pin it up": the note leaves the mat for its slot on the wall. It goes as it
  // is, bare paper — the fastener is chosen once it has landed.
  function pinUp() {
    if (textDraft) commitText(); // what is being typed goes up with it
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

  // A sticker released off the sheet: it sticks only where it was dropped, and
  // only if that is on the paper. Nothing else about the editor moves — the
  // held tool and the mode are somebody else's gesture.
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
    // Same as a tap on the paper: the open box commits first, then this drop
    // does its own job on what that left behind.
    if (textDraft) commitText();
    // That commit may have taken the last free slot, and `addElement` is a
    // silent no-op on a full note: refuse the drop so the sheet flies the
    // sticker home instead of swallowing it.
    const live = contentRef.current;
    if (!live || live.elements.length >= MAX_ELEMENTS) return false;
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
    // A second finger never joins the first one's gesture: it takes it over.
    if (activeId.current !== null && activeId.current !== e.pointerId) {
      startPinch(e);
      return;
    }
    activeId.current = e.pointerId;
    points.current.set(e.pointerId, [e.clientX, e.clientY]);
    setFontsOpen(false);
    // The text box never takes the pointer (it is pointer-events-none), so a
    // pointer-down on the paper is always a tap away from it: commit, then let
    // this tap do its own job.
    if (textDraft) commitText();
    const live = contentRef.current ?? content; // commitText may have grown it
    const [x, y, p] = toNote(e);
    // Keep the gesture on the paper even when the pointer wanders off it.
    capturePointer(e);

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

    // Hand mode: a placed element is never taken hold of (#79), so a press is
    // only ever the paper's own — a bottom corner peels it, anywhere else on it
    // (over what is drawn there too) turns it.
    const corner = curlCorner(live.curl, x, y);
    if (corner) {
      curlRef.current = { corner, start: live.curl[corner], from: [x, y] };
      setGrip(corner);
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
    // Nothing to pinch mid-sentence, and the eraser rubs with one finger.
    if (textDraft || (held !== null && draftRef.current === null)) return;
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
    setGrip("turn");
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
    setGrip("turn");
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
      // pressed (#69). A finger can't: its press shows the same mark.
      if (held === null && e.pointerType === "mouse") {
        const [x, y] = toNote(e);
        setGrip(curlCorner(live.curl, x, y));
      }
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
    endGesture();
    // iOS Safari raises the keyboard only for a focus() inside the gesture that
    // asked for it — a frame later and the box is live with no keyboard under
    // it. Keep this call synchronous here, and check it on a real phone.
    if (textDraft) {
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

  function commitText() {
    const draft = textDraft;
    setTextDraft(null);
    const live = contentRef.current;
    const text = draft?.text.trim();
    if (draft && live && text) apply(addElement(live, { ...draft, text })); // empty adds nothing
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
    if (!busy() && !pinchRef.current) setGrip(null);
  }

  const draft = draftRef.current;
  // The image of the tool in your hand, for a fine pointer to carry.
  const tool = held ? heldTool(held) : null;
  // The live stroke and the open box are elements like any other: each joins
  // the end of the note while it is being made.
  const shown = !content
    ? content
    : textDraft
      ? addElement(content, textDraft)
      : draft
        ? addElement(content, draft)
        : content;
  // the corner a grip mark is drawn on; a turn has none
  const corner = grip === "turn" ? null : grip;

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
              // Pinned up, the note is on the wall: the mat slides away bare,
              // and comes back up with it lying where it was.
              visibility: landing ? "hidden" : undefined,
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
              onPointerLeave={leavePaper}
              style={{
                width: "min(88vw, 60vh)",
                aspectRatio: NOTE_PAPER_ASPECT_RATIO,
                filter: "drop-shadow(3px 9px 12px rgba(0,0,0,.45))",
                // the held tool IS the cursor over the paper
                cursor: fine && held ? "none" : undefined,
                ...noteMotion(
                  tearing,
                  crumpling,
                  shown.rotation,
                  grip === "turn",
                ),
              }}
            >
              <NotePaper content={shown} />

              {/* The overlay rides inside the rotated sheet, so everything on
                  it is drawn in plain note units and turns with the paper. It
                  never takes the pointer: the paper under it does. */}
              {((caret && textDraft) || corner) && (
                <svg
                  viewBox={`0 0 ${CANVAS} ${CANVAS}`}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  aria-hidden="true"
                >
                  <title>grip and caret</title>
                  {corner && gripMark(corner, shown.curl)}
                  {caret && textDraft && caretRect(caret, textDraft)}
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
                    // This Escape threw the box away; it is not also the one
                    // that puts the open sticker sheet (or the fan) away.
                    e.stopPropagation();
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

      {/* a fanned stack closes on a tap anywhere else */}
      {fanned && (
        <button
          type="button"
          aria-label="Close the pads"
          className="absolute inset-0 z-20 h-full w-full cursor-default border-0 bg-transparent p-0"
          onClick={() => setFanned(false)}
        />
      )}

      {/* the desk strip: the mat's bottom edge, where the objects lie. ONE row
          at every width (#74) — three groups on the same edge: left, the pads;
          centre, the markers and the draw/write control; right, the sticker
          tab, the eraser, then the bin. Nothing wraps and nothing moves up: the
          corners are where the corner objects live, and the room a narrow
          screen takes comes out of the space BETWEEN the markers, never out of
          the four corners. */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-end justify-between pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        style={{ paddingInline: DESK_GAP }}
      >
        <div
          data-slot="pads"
          // `isolate` keeps the trigger's z-30 inside this box, so the
          // resting stack sits UNDER the marker leaning on it; fanned, the
          // pile has to clear the backdrop that closes it (z-20).
          className={`relative isolate shrink-0${fanned ? " z-30" : ""}`}
          // A hair narrower than the resting pile is wide: at 320 those two
          // pixels are the difference between the strip fitting and the bin
          // hanging off the mat. The marker beside it leans over the pile's
          // last couple of pixels, and is the thing under the finger there.
          style={{ width: PAD + 8, height: PAD + 8 }}
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
            // The hit area grows left, up and down but NOT right: past the
            // stack's own box it lands on the black marker, which at 320 is
            // already leaning under it (#74's SQUEEZE).
            className="-inset-y-1.5 -left-1.5 absolute right-0 z-30 min-h-12 min-w-12 border-0 bg-transparent p-0"
          />
        </div>

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
              setMode(m);
              setFontsOpen(m === "write");
            }}
            onFont={(f) => {
              setFont(f);
              setFontsOpen(false);
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
              onClick={() => setSheetOpen((open) => !open)}
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
          onPinned={() => apply(null)}
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
  tearing: boolean,
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
  if (tearing) return { transform: `${TEAR_FROM} ${tilt}`, transition: "none" };
  return {
    transform: tilt,
    // A sheet being turned must sit under the finger, not ease towards it.
    transition: turning ? "none" : `transform ${TEAR_MS}ms ${EASE_OUT}`,
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
