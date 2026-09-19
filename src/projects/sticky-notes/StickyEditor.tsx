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
import {
  capturePointer,
  centreOffset,
  EASE_OUT,
  flyTo,
  type Offset,
  SHEET_MS,
  STILL,
} from "./desk";
import {
  BIN_SPACER,
  Bin,
  BinSlip,
  DESK_GAP,
  ERASER_SLOT,
  EraserBody,
  HAND_SLOT,
  HandBody,
  heldTool,
  MARKER_SLOT,
  MarkerBody,
  type Mode,
  ModeControl,
  PAPER_SIDE,
  PadChooser,
  PIN_ROOM,
  SHAKE_MS,
  StickerTab,
  TapeLabel,
  ToolSlot,
  TRAY_PAD,
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
  type NoteElement,
  type PaperColour,
} from "./note-schema";
import { PinUp } from "./pin-up";
import { SHEET_H, StickerSheet } from "./StickerSheet";

// The mat starts bare, so the island's first render is identical on the server
// and the client: no mounted gate needed. All model logic lives in note-editor;
// this shell only maps pointers onto it.

const TEAR_MS = 400;
const CRUMPLE_MS = 400;
const GHOST_MS = 200;

// Clears the rocker, the tallest thing in the tray, so a lifted marker never
// meets the paper.
const TRAY_ROOM = "8rem";

const NIB = 8; // the editor's one fixed marker size
const TEXT_SIZE = 30;
const TEXT_W = 240;

type StrokeEl = Extract<NoteElement, { type: "stroke" }>;
type TextEl = Extract<NoteElement, { type: "text" }>;
type StickerEl = Extract<NoteElement, { type: "sticker" }>;
type Placing = TextEl | StickerEl;
// A drag on the element being placed: every move is measured from `start`, the
// element as it was when the drag began.
type PlacingDrag = {
  grip: PlacingGrip;
  from: [number, number];
  start: Placing;
};
type Held = Ink | "eraser" | "hand";

const isInk = (held: Held): held is Ink => held !== "hand" && held !== "eraser";

export default function StickyEditor({
  initialContent = null,
  up = true,
  pinning,
  onPinning,
}: {
  initialContent?: NoteContent | null;
  // The island stays mounted under a mat that has gone down, so it must stop
  // listening to the wall's presses and keys.
  up?: boolean;
  pinning?: NoteContent;
  onPinning?: (note: NoteContent | undefined) => void;
}) {
  const [content, setContent] = useState<NoteContent | null>(initialContent);
  // The live note: a pointer event has to read back what the previous move
  // wrote, before that state update has landed. `apply` is the only way content
  // changes, so the ref and the state can't drift.
  const contentRef = useRef(content);
  contentRef.current = content;
  // Where a flight starts, parked for a frame; dropping it to null is what
  // sends the sheet, so the transition carries it.
  const [tearing, setTearing] = useState<Offset | null>(null);
  const [crumpling, setCrumpling] = useState<Offset | null>(null);
  const [landed, setLanded] = useState(true);
  const landTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [binSlipOpen, setBinSlipOpen] = useState(false);

  const [held, setHeld] = useState<Held>("black");
  const [mode, setMode] = useState<Mode>("draw");
  const [font, setFont] = useState<Font>("casual");
  const [fontsOpen, setFontsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The element on the note but not yet part of it. The ref is the live one,
  // for the same reason as contentRef.
  const [placing, setPlacing] = useState<Placing | null>(null);
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const [using, setUsing] = useState(false);
  const [turning, setTurning] = useState(false);
  const [gripCorner, setGripCorner] = useState<Corner | null>(null);
  const [fine, setFine] = useState(false);
  const [shaking, setShaking] = useState(false);
  // Elements have no id, so a removed one can't fade in place: its ghost is
  // re-drawn on an overlay that fades out and unmounts. `id` keys that overlay,
  // so rubbing again mid-fade mounts a fresh node instead of reversing the fade.
  // ponytail: one ghost at a time, the newest wins. Rubbing out a pile fades
  // only the last of them; keep a list if that ever reads wrong.
  const [ghost, setGhost] = useState<{
    el: NoteElement;
    out: boolean;
    id: number;
  } | null>(null);

  // Where the next glyph would land, in note units.
  const [caret, setCaret] = useState<{ x: number; y: number } | null>(null);
  const [caretTick, setCaretTick] = useState(0);

  const pinButton = useRef<HTMLButtonElement>(null);
  const rocker = useRef<HTMLDivElement>(null);
  const firstPad = useRef<HTMLButtonElement>(null);
  const binButton = useRef<HTMLButtonElement>(null);
  const binYes = useRef<HTMLButtonElement>(null);
  const binCorner = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const crumpleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const paperRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Transient pointer state lives in refs (no re-render on read); the live
  // stroke uses forceRender so the note grows as you draw.
  const draftRef = useRef<StrokeEl | null>(null);
  const rubbingRef = useRef(false);
  // Turning the note. The angle is taken in CLIENT space about the paper's
  // centre: in note units it would be measured through the very rotation it is
  // setting. `start` stays null while a press near the centre has no angle yet.
  const spinRef = useRef<{
    centre: [number, number];
    from: number;
    start: number | null;
  } | null>(null);
  // The pull is read from where the corner was taken hold of, so grabbing the
  // flap doesn't move the fold.
  const curlRef = useRef<{
    corner: Corner;
    start: number;
    from: [number, number];
  } | null>(null);
  // `from` is where the second finger landed, seen from the first; `rotation` is
  // the note's when it did.
  const pinchRef = useRef<{
    a: number;
    b: number;
    from: [number, number];
    rotation: number;
  } | null>(null);
  // Every pointer that came down on the paper, in client coordinates.
  const points = useRef(new Map<number, [number, number]>());
  const ghostTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ghostId = useRef(0);
  const placingDragRef = useRef<PlacingDrag | null>(null);
  // One gesture at a time: while one is live, moves from any other pointer are
  // ignored rather than allowed to steal it. A second finger coming DOWN is the
  // exception: it takes over (startPinch).
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

  const choosing = content === null;
  useEffect(() => {
    if (choosing && up) firstPad.current?.focus();
  }, [choosing, up]);

  // A press on the bin itself is left to the bin's click (binIt), so one tap is
  // one answer. Escape is caught in the capture phase, before the sheet's.
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
      clearTimeout(landTimer.current);
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

  const writing = isInk(held) && mode === "write";
  useEffect(() => {
    loadFont(font);
    if (writing) for (const f of FONTS) loadFont(f);
  }, [font, writing]);

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

  useEffect(() => {
    if (!sheetOpen || !up) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      live = false;
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
    setCaret(
      caretAt(
        paperRef.current,
        placing,
        contentRef.current?.elements.length ?? 0,
      ),
    );
    // The caret only ever sits at the end, so the textarea's own cursor goes
    // there too — otherwise Home or a tap inside the box types where the caret
    // isn't.
    // ponytail: end of text only. Upgrade: draw the caret at `selectionStart`
    // and stop pinning the selection here.
    const box = textRef.current;
    box?.setSelectionRange(box.value.length, box.value.length);
  }, [placing, caretTick]);

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
    // capture phase: this Escape must not also be the one that puts the sticker
    // sheet or the font samples away
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [isPlacing, up]);

  function showGhost(el: NoteElement) {
    clearTimeout(ghostTimer.current);
    ghostId.current += 1;
    setGhost({ el, out: false, id: ghostId.current });
    ghostTimer.current = setTimeout(() => setGhost(null), GHOST_MS + 80);
  }

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

  function takeSheet(colour: PaperColour, pad: HTMLElement) {
    if (content) return;
    const note = { ...emptyNote(), colour };
    const from = pad.getBoundingClientRect();
    apply(note);
    setTearing(centreOffset(from, stage.current?.getBoundingClientRect()));
    setLanded(false);
    clearTimeout(landTimer.current);
    landTimer.current = setTimeout(() => setLanded(true), TEAR_MS);
  }

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

  // One crumple at a time: a second "Bin it" in the same breath would start a
  // second timer, and only the last is cleared on unmount. The ref, not
  // `crumpling`: state read here can be a render behind.
  function crumple() {
    if (crumpleTimer.current !== undefined) return;
    setBinSlipOpen(false);
    setCrumpling(
      centreOffset(
        binButton.current?.getBoundingClientRect(),
        paperRef.current?.getBoundingClientRect(),
      ),
    );
    crumpleTimer.current = setTimeout(() => {
      crumpleTimer.current = undefined;
      setCrumpling(null);
      clearMat();
    }, CRUMPLE_MS);
  }

  function keepIt() {
    setBinSlipOpen(false);
    binButton.current?.focus();
  }

  function clearMat() {
    apply(null);
    setHeld("black");
    setSheetOpen(false);
    setFontsOpen(false);
  }

  function pinUp() {
    fixPlacing(); // what is being placed goes up with it
    const live = contentRef.current;
    if (!live || crumpling) return;
    const from = paperRef.current?.getBoundingClientRect();
    // The Spotlight has to be there before there is anywhere to fly to, so
    // this render happens now rather than after the handler.
    flushSync(() => onPinning?.({ ...live, fastener: "none" }));
    flyTo(from, document.querySelector("[data-spotlight]"));
  }

  function pickUp(tool: Held) {
    fixPlacing();
    setHeld((h) => (h === tool ? "hand" : tool));
    setFontsOpen(false);
    hideCursorTool();
  }

  const toolLabel = (tool: Held, name: string) =>
    `${held === tool ? "Put down" : "Pick up"} the ${name}`;

  // Client → note coordinates. NotePaper has no fastener headroom, so the
  // paper's box IS 0..CANVAS on both axes. The note renders tilted, so every
  // pointer comes back through that rotation here; the maths is in note-editor.
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

  // The point's third number is pressure, kept in the schema and inert: a marker
  // has one nib, so what the pointer reports is never asked for.
  function toNote(e: ReactPointerEvent): [number, number, number] {
    const [x, y] = clientToNote(e.clientX, e.clientY);
    return [x, y, 0.5];
  }

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
    // The peel's own pointer-down already fixed what was being placed; this is
    // for a second finger that started placing while the first carried this one.
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
    if (activeId.current !== null && activeId.current !== e.pointerId) {
      startPinch(e);
      return;
    }
    activeId.current = e.pointerId;
    points.current.set(e.pointerId, [e.clientX, e.clientY]);
    setFontsOpen(false);
    const live = contentRef.current ?? content;
    const [x, y, p] = toNote(e);
    capturePointer(e);

    const el = placingRef.current;
    if (el) {
      const grip = placingGrip(el, x, y);
      if (grip) placingDragRef.current = { grip, from: [x, y], start: el };
      else fixPlacing();
      return;
    }

    // The open sticker sheet is what you hold, so the paper takes only the
    // peeled sticker's placing, above.
    if (sheetOpen) return;

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

    setUsing(true);
    const corner = curlCorner(live.curl, x, y);
    if (corner) {
      curlRef.current = { corner, start: live.curl[corner], from: [x, y] };
      setGripCorner(corner);
      return;
    }
    startSpin(e, x, y);
  }

  function startPinch(e: ReactPointerEvent) {
    const first = activeId.current;
    const live = contentRef.current;
    const a = first === null ? undefined : points.current.get(first);
    if (!live || first === null || !a) return;
    // A held tool that isn't mid-stroke (the eraser, a marker writing) keeps to
    // one finger, and a drag on what is being placed is never turned out from
    // under itself.
    if (
      sheetOpen ||
      placingDragRef.current ||
      (held !== "hand" && draftRef.current === null)
    )
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

  // A turn pressed near the centre takes its starting angle from the first move
  // out, so the note doesn't jump.
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
      // pressed; a finger can't.
      if (
        held === "hand" &&
        !sheetOpen &&
        !placingRef.current &&
        e.pointerType === "mouse"
      ) {
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
    // A sticker let go wholly off the paper is dropped, not added: the sheet it
    // came from never runs out.
    const el = placingRef.current;
    if (dragged && el?.type === "sticker" && isOffNote(el)) {
      applyPlacing(null);
      return;
    }
    // iOS Safari raises the keyboard only for a focus() inside the gesture that
    // asked for it, so this call stays synchronous here. It runs after every
    // press on a box, so a keyboard put away comes back with the next touch.
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

  function rub(x: number, y: number) {
    const live = contentRef.current;
    if (!live) return;
    const hit = hitTest(live, x, y);
    if (hit === undefined) return;
    const el = live.elements[hit];
    if (!el) return;
    showGhost(el);
    apply(removeElement(live, hit));
  }

  // The grab reach is HANDLE_TOUCH px for every pointer, a mouse's too; how many
  // note units that covers depends on the size the sheet is drawn right now.
  function placingGrip(el: Placing, x: number, y: number): PlacingGrip | null {
    const rect = paperRef.current?.getBoundingClientRect();
    const side = rect?.width
      ? noteSide(rect.width, contentRef.current?.rotation ?? 0)
      : CANVAS;
    return grabPlacing(el, x, y, (HANDLE_TOUCH / 2 / side) * CANVAS);
  }

  // Measured from where the drag began, but merged into the live element, so a
  // letter typed mid-drag isn't lost.
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

  // Safe to call twice: one press can arrive by the document's pointer-down and
  // then by the handler it lands on.
  function fixPlacing() {
    const el = placingRef.current;
    if (!el) return;
    applyPlacing(null);
    const fixed = fixedElement(el);
    const live = contentRef.current;
    if (fixed && live) apply(addElement(live, fixed));
  }

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

  // Only a corner lifted by hover settles back; a peel in progress keeps its
  // grip.
  function leavePaper() {
    hideCursorTool();
    if (!busy() && !pinchRef.current) setGripCorner(null);
  }

  const draft = draftRef.current;
  // The hand carries no image: a mouse's own grab cursor already is one.
  const tool = held === "hand" || sheetOpen ? null : heldTool(held);
  const shown = !content
    ? content
    : placing
      ? addElement(content, placing)
      : draft
        ? addElement(content, draft)
        : content;

  return (
    <div className="absolute inset-0 select-none">
      {/* PIN_ROOM above is the room "pin it up" is taped in; the sticker sheet
          takes the floor while it is up. A size container: the paper's 100cqh. */}
      <div
        ref={stage}
        className={`${STILL} pointer-events-none absolute inset-x-0 flex items-center justify-center`}
        style={{
          top: sheetOpen ? 0 : PIN_ROOM,
          bottom: sheetOpen ? SHEET_H : TRAY_ROOM,
          containerType: "size",
          transition: `top ${SHEET_MS}ms ${EASE_OUT}, bottom ${SHEET_MS}ms ${EASE_OUT}`,
        }}
      >
        {shown && (
          <div
            className="relative"
            style={{
              // Hidden, not unmounted: the mat comes back up with the note
              // lying where it was.
              visibility: pinning ? "hidden" : undefined,
            }}
          >
            <div
              ref={paperRef}
              data-colour={shown.colour}
              // in flight onto the mat or into the bin: it takes no marks
              aria-busy={tearing !== null || crumpling !== null}
              className={`${STILL} pointer-events-auto relative touch-none`}
              onPointerDown={onPaperDown}
              onPointerMove={onPaperMove}
              onPointerUp={onPaperUp}
              onPointerCancel={onPaperUp}
              onPointerLeave={leavePaper}
              style={{
                // The width is the note's own side until the room the stage
                // leaves is the smaller of the two.
                // ponytail: capped on the side, not the bigger tilted box it
                // occupies. Take the tilt off the cap if a mat ever clips one.
                width: `min(${PAPER_SIDE}, 100cqh)`,
                aspectRatio: NOTE_PAPER_ASPECT_RATIO,
                filter: "drop-shadow(3px 9px 12px rgba(0,0,0,.45))",
                // the held tool IS the cursor over the paper; the hand is the
                // browser's own, closed while it turns or peels
                cursor:
                  !fine || sheetOpen
                    ? undefined
                    : held !== "hand"
                      ? "none"
                      : using || turning
                        ? "grabbing"
                        : "grab",
                ...noteMotion(tearing, crumpling, shown.rotation, turning),
              }}
            >
              <NotePaper content={shown} />

              {/* The overlay rides inside the rotated sheet, so everything on it
                  is drawn in plain note units and turns with the paper. */}
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

              {/* No onBlur: a phone putting its keyboard away blurs this, and
                  only a press elsewhere fixes the box. */}
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

            {/* In this frame rather than on the paper, so it rides the sheet's
                shift with the note but never turns with it. */}
            <TapeLabel
              ref={pinButton}
              loud
              away={
                !landed ||
                crumpling !== null ||
                sheetOpen ||
                placing?.type === "text"
              }
              onClick={pinUp}
              // `-translate-x-1/2` survives TAPE's inline `transform: rotate`
              // only because Tailwind v4 writes it to the separate CSS
              // `translate` property, which the browser applies alongside
              className="-translate-x-1/2 pointer-events-auto absolute bottom-full left-1/2 mb-2 w-max"
            >
              pin it up
            </TapeLabel>
          </div>
        )}
      </div>

      <PadChooser
        ref={firstPad}
        putAway={!choosing}
        torn={content?.colour ?? null}
        onTear={takeSheet}
      />

      {/* ONE centred row, nothing wrapping: the room a narrow screen takes
          comes out of the gap before the bin, then the space between the
          markers (the SQUEEZE in MARKER_SLOT). z-40: under the sheet's z-50. */}
      <div
        data-slot="tray"
        inert={choosing || sheetOpen}
        // `justify-center-safe`: centred while the row fits; on a screen too
        // narrow for it, it overflows off the right end only, where plain
        // centring would push the hand off the left edge out of reach.
        className={`absolute inset-x-0 bottom-0 z-40 flex items-end justify-center-safe ${STILL}`}
        style={{
          gap: DESK_GAP,
          paddingInline: DESK_GAP,
          paddingBottom: TRAY_PAD,
          transform: choosing ? "translateY(110%)" : "none",
          opacity: sheetOpen ? 0.4 : 1,
          transition: `transform ${TEAR_MS}ms ${EASE_OUT}, opacity ${SHEET_MS}ms ${EASE_OUT}`,
        }}
      >
        <ToolSlot
          label={toolLabel("hand", "hand")}
          held={held === "hand"}
          slot={HAND_SLOT}
          onClick={() => pickUp("hand")}
        >
          <HandBody held={held === "hand"} using={using} />
        </ToolSlot>
        {INKS.map((ink) => (
          <ToolSlot
            key={ink}
            label={toolLabel(ink, `${ink} marker`)}
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
            // "Aa" spares only a text box, whose samples it brings back up.
            if (m === "draw" || placingRef.current?.type !== "text")
              fixPlacing();
            setMode(m);
            setFontsOpen(m === "write");
          }}
          onFont={(f) => {
            setFont(f);
            setFontsOpen(false);
            const live = placingRef.current;
            if (live?.type === "text") applyPlacing({ ...live, font: f });
          }}
        />
        <StickerTab
          open={sheetOpen}
          onClick={() => {
            fixPlacing();
            setSheetOpen((open) => !open);
          }}
        />
        <ToolSlot
          label={toolLabel("eraser", "eraser")}
          held={held === "eraser"}
          slot={ERASER_SLOT}
          onClick={() => pickUp("eraser")}
        >
          <EraserBody held={held === "eraser"} using={using} />
        </ToolSlot>
        <span aria-hidden="true" className="block" style={BIN_SPACER} />
        {/* A press here takes no focus: otherwise a tap on the bin while the slip
            asks moves focus out of the slip, closing it, and the click asks
            again. */}
        <div
          ref={binCorner}
          className="relative shrink-0"
          onPointerDown={(e) => e.preventDefault()}
        >
          <Bin
            ref={binButton}
            onClick={binIt}
            disabled={!content || crumpling !== null}
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

      <StickerSheet
        open={sheetOpen}
        canPeel={!!content && content.elements.length < MAX_ELEMENTS}
        onDrop={dropSticker}
        onClose={() => setSheetOpen(false)}
      />

      {pinning && onPinning && (
        <PinUp
          content={pinning}
          onChange={onPinning}
          // flushSync first: the mat is inert until it is up again, so focus
          // can't reach the button before then.
          onBack={() => {
            flushSync(() => onPinning(undefined));
            pinButton.current?.focus();
          }}
          onPinned={clearMat}
        />
      )}

      {/* parked invisible until followCursorTool puts it under the pointer */}
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

// The sheet's own transform: the stored tilt, under whatever flight it is on.
// The tilt is the LAST transform in the list, so it turns the paper about its
// own centre whatever the flight did to it.
function noteMotion(
  tearing: Offset | null,
  crumpling: Offset | null,
  rotation: number,
  turning: boolean,
): CSSProperties {
  const tilt = `rotate(${rotation}deg)`;
  if (crumpling)
    return {
      transform: `translate(${crumpling.dx}px, ${crumpling.dy}px) rotate(260deg) scale(.06) ${tilt}`,
      opacity: 0,
      transition: `transform ${CRUMPLE_MS}ms cubic-bezier(.5,0,.8,.35), opacity ${CRUMPLE_MS}ms ease-in`,
    };
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

// In percent, so the hidden textarea needs no measurement of the paper.
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
