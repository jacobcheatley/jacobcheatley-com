import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  addElement,
  bounds,
  clampCoord,
  type Element,
  emptyNote,
  hitTest,
  isOffNote,
  moveElement,
  removeElement,
  settleElement,
  updateElement,
} from "./note-editor";
import { FONT_FAMILIES, loadFont } from "./note-fonts";
import {
  FASTENER_MARGIN,
  INK,
  NOTE_ASPECT_RATIO,
  NoteRender,
  PAPER,
} from "./note-render";
import {
  CANVAS,
  type Fastener,
  FONTS,
  type Font,
  INKS,
  type Ink,
  MAX_POINTS_PER_STROKE,
  type NoteContent,
  noteSchema,
  PAPER_COLOURS,
  type PaperColour,
  STICKER_EMOJI,
} from "./note-schema";
import { savePending } from "./pending-note";
import { addNoteFn } from "./sticky-notes.fn";

// The Sticky Notes editor (#61): a full-screen, mobile-first, client-only island
// where a visitor draws a note and pins it to the wall. The note surface is the
// shared pure NoteRender; interaction (freehand marker, text, stickers, tweezers
// select/move, drag-off/erase delete) is layered on top. Submit is diegetic —
// pressing a fastener posts the note via addNoteFn, saves a localStorage pending
// copy, and animates the note away onto the wall. There is NO undo (removal is
// physical), matching the spec.
//
// Coordinate model: pointer input maps into NoteRender's exact frame
// (viewBox 0 -MARGIN CANVAS CANVAS+MARGIN). The editing surface is kept upright
// (unrotated) so that mapping stays a plain linear transform; the note's stored
// rotation is adjustable in the tray and shown on the wall / zoom / CLI.

type Tool = "marker" | "text" | "sticker" | "tweezers";
type StrokeEl = Extract<Element, { type: "stroke" }>;
type TextEl = Extract<Element, { type: "text" }>;
type TextDraft = { x: number; y: number; value: string };

const MARGIN = FASTENER_MARGIN;
const TEXT_DEFAULT_SIZE = 30;
const TEXT_DEFAULT_W = 240;

// Cool slate cutting-mat desk (spec #49): grid rules over a dark wash, distinct
// from the wall's warm cork. Exported so the route's pre-mount placeholder shows
// the exact same ground (no flash on hydration).
export const DESK_BG = {
  backgroundImage: [
    "repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "radial-gradient(120% 120% at 50% 0%, #2a2f36, #171a1f)",
  ].join(", "),
  backgroundSize: "26px 26px, 26px 26px, cover",
};

// Fasteners offered as submit buttons (all but "none" — a real fastener IS the
// submit). Labelled for the diegetic "press it to the board" row.
const FASTENERS_UI: { key: Fastener; label: string }[] = [
  { key: "pin-red", label: "Red pin" },
  { key: "pin-green", label: "Green pin" },
  { key: "pin-yellow", label: "Yellow pin" },
  { key: "pin-blue", label: "Blue pin" },
  { key: "tape-masking", label: "Masking tape" },
  { key: "tape-clear", label: "Clear tape" },
  { key: "staple", label: "Staple" },
  { key: "staples", label: "Two staples" },
  { key: "stick", label: "Sticky tack" },
];

const PIN_DOT: Partial<Record<Fastener, string>> = {
  "pin-red": "#e11d48",
  "pin-green": "#16a34a",
  "pin-yellow": "#eab308",
  "pin-blue": "#2563eb",
};

export function StickyEditor() {
  const navigate = useNavigate();
  const addNote = useServerFn(addNoteFn);

  const [content, setContent] = useState<NoteContent>(() => emptyNote());
  const [tool, setTool] = useState<Tool>("marker");
  const [ink, setInk] = useState<Ink>("black");
  const [size, setSize] = useState(8);
  const [font, setFont] = useState<Font>("casual"); // the editor default
  const [armedEmoji, setArmedEmoji] = useState<string | null>(null);
  const [selected, setSelected] = useState(-1);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"editing" | "posting" | "flying">(
    "editing",
  );

  // Transient pointer state lives in refs (no re-render on read); the live stroke
  // uses forceRender so the note grows as you draw.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<StrokeEl | null>(null);
  const dragRef = useRef<{ index: number; x: number; y: number } | null>(null);
  const authorRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // Focus the text box AFTER the placing tap settles. `autoFocus` would focus it
  // synchronously mid-gesture, and that same tap's trailing click on the desk
  // then blurs it → an instant empty commit. A next-frame focus lands after the
  // gesture, so it sticks.
  const textOpen = textDraft !== null;
  useEffect(() => {
    if (!textOpen) return;
    const id = requestAnimationFrame(() => textInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [textOpen]);

  // Casual is the default font; warm its webfont so the first text box paints
  // in the right family. Other families load on selection.
  useEffect(() => {
    loadFont(font);
  }, [font]);

  // Map a pointer event into note coordinates (NoteRender's frame). y carries the
  // fastener margin so 0..CANVAS is the paper.
  function toNote(e: ReactPointerEvent): [number, number, number] {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return [0, 0, 0.5];
    const x = clampCoord(((e.clientX - rect.left) / rect.width) * CANVAS);
    const y = clampCoord(
      ((e.clientY - rect.top) / rect.height) * (CANVAS + MARGIN) - MARGIN,
    );
    return [x, y, e.pressure || 0.5];
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (status !== "editing" || textDraft) return;
    const [x, y, p] = toNote(e);

    if (tool === "marker") {
      surfaceRef.current?.setPointerCapture(e.pointerId);
      draftRef.current = { type: "stroke", ink, size, points: [[x, y, p]] };
      setSelected(-1);
      forceRender();
    } else if (tool === "text") {
      setSelected(-1);
      setTextDraft({ x, y, value: "" });
    } else if (tool === "sticker" && armedEmoji) {
      setContent((c) =>
        addElement(c, {
          type: "sticker",
          x,
          y,
          emoji: armedEmoji as (typeof STICKER_EMOJI)[number],
          scale: 1,
          rotation: 0,
        }),
      );
    } else if (tool === "tweezers") {
      const hit = hitTest(content, x, y);
      setSelected(hit);
      if (hit >= 0) {
        surfaceRef.current?.setPointerCapture(e.pointerId);
        dragRef.current = { index: hit, x, y };
      }
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const [x, y, p] = toNote(e);
    const draft = draftRef.current;
    if (draft) {
      if (draft.points.length < MAX_POINTS_PER_STROKE) {
        draft.points.push([x, y, p]);
        forceRender();
      }
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const dx = x - drag.x;
      const dy = y - drag.y;
      drag.x = x;
      drag.y = y;
      setContent((c) => moveElement(c, drag.index, dx, dy));
    }
  }

  function onPointerUp() {
    const draft = draftRef.current;
    if (draft) {
      draftRef.current = null;
      // A dot (single point) draws nothing via perfect-freehand — needs ≥2.
      if (draft.points.length >= 2) setContent((c) => addElement(c, draft));
      forceRender();
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      // The drag itself is unclamped. On release: fully off the paper → delete
      // it (the physical drag-off-to-bin); otherwise settle it back inside the
      // contract's coordinate range so submit can't fail on a wild drag.
      const el = content.elements[drag.index];
      if (el && isOffNote(el)) {
        setContent((c) => removeElement(c, drag.index));
        setSelected(-1);
      } else if (el) {
        const settled = settleElement(el);
        if (settled !== el)
          setContent((c) => updateElement(c, drag.index, settled));
      }
    }
  }

  function commitText() {
    const draft = textDraft;
    setTextDraft(null);
    const text = draft?.value.trim();
    if (!draft || !text) return;
    setContent((c) =>
      addElement(c, {
        type: "text",
        x: draft.x,
        y: draft.y,
        w: Math.max(40, Math.min(TEXT_DEFAULT_W, CANVAS - draft.x + 50)),
        text,
        font,
        color: ink,
        fontSize: TEXT_DEFAULT_SIZE,
        rotation: 0,
      }),
    );
  }

  function deleteSelected() {
    if (selected < 0) return;
    setContent((c) => removeElement(c, selected));
    setSelected(-1);
  }

  function pickSticker(emoji: string) {
    setArmedEmoji(emoji);
    setTool("sticker");
    setSheetOpen(false);
    setSelected(-1);
  }

  async function submit(fastener: Fastener) {
    if (status !== "editing") return;
    const finalContent: NoteContent = { ...content, fastener };
    const parsed = noteSchema.safeParse({ author, content: finalContent });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // The author field is the one the visitor drives directly, so it gets a
      // human prompt; other issues (caps, bad element) surface zod's message.
      if (issue?.path[0] === "author") {
        setError("Add your name to sign your note.");
        authorRef.current?.focus();
      } else {
        setError(issue?.message ?? "Something's not right with this note.");
      }
      return;
    }
    setError(null);
    setSelected(-1);
    setStatus("posting");
    try {
      await addNote({ data: parsed.data });
    } catch {
      setError("Couldn't pin it up — please try again.");
      setStatus("editing");
      return;
    }
    savePending({ ...parsed.data, submittedAt: Date.now() });
    // Diegetic placement: lift the note off the desk, then land on the wall.
    setStatus("flying");
    setContent(finalContent);
    setTimeout(() => navigate({ to: "/sticky-notes" }), 650);
  }

  // The note shown while drawing includes the in-progress stroke.
  const draft = draftRef.current;
  const shown = draft ? addElement(content, draft) : content;
  const selEl = selected >= 0 ? content.elements[selected] : undefined;

  return (
    <div
      className="flex min-h-dvh flex-col overflow-hidden text-slate-100"
      style={DESK_BG}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <a
          href="/sticky-notes"
          className="font-sans text-sm text-slate-300 no-underline hover:text-white hover:underline"
        >
          ← the wall
        </a>
        <input
          ref={authorRef}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          maxLength={50}
          placeholder="your name"
          aria-label="Your name"
          className="w-40 rounded-sm border border-slate-600 bg-slate-800/70 px-2 py-1 text-center font-sans text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
        />
      </header>

      {/* desk stage: the note surface, upright for input */}
      <div className="relative flex flex-1 items-center justify-center p-4">
        <div
          ref={surfaceRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative w-[min(88vw,min(70vh,520px))] touch-none select-none"
          style={{
            aspectRatio: NOTE_ASPECT_RATIO,
            filter: "drop-shadow(0 14px 30px rgba(0,0,0,.5))",
            cursor: tool === "tweezers" ? "grab" : "crosshair",
            transition: "transform .6s ease-in, opacity .6s ease-in",
            transform:
              status === "flying"
                ? "translateY(-40vh) scale(.15) rotate(8deg)"
                : "none",
            opacity: status === "flying" ? 0 : 1,
          }}
        >
          <NoteRender content={shown} />

          {/* selection highlight — same frame as NoteRender */}
          {selEl && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 ${-MARGIN} ${CANVAS} ${CANVAS + MARGIN}`}
              aria-hidden="true"
            >
              <title>selection</title>
              <SelectionBox el={selEl} />
            </svg>
          )}

          {/* inline text input at the placement point (a real HTML input) */}
          {textDraft && (
            <input
              ref={textInputRef}
              value={textDraft.value}
              onChange={(e) =>
                setTextDraft({ ...textDraft, value: e.target.value })
              }
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                if (e.key === "Escape") setTextDraft(null);
              }}
              maxLength={280}
              aria-label="Text box"
              className="absolute -translate-y-full border border-dashed border-slate-500 bg-white/85 px-1 text-slate-900 outline-none"
              style={{
                left: `${(textDraft.x / CANVAS) * 100}%`,
                top: `${((textDraft.y + MARGIN) / (CANVAS + MARGIN)) * 100}%`,
                fontFamily: FONT_FAMILIES[font],
                fontSize: "1rem",
                color: INK[ink],
                maxWidth: "70%",
              }}
            />
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="px-4 pb-1 text-center font-sans text-sm text-rose-300"
        >
          {error}
        </p>
      )}

      {/* the tray — tools, contextual controls, note settings, and submit */}
      <div className="border-t border-slate-700 bg-slate-900/85 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] font-sans">
        {/* contextual controls for a selected object (tweezers) */}
        {selEl && (
          <SelectedControls
            el={selEl}
            onChange={(next) =>
              setContent((c) => updateElement(c, selected, next))
            }
            onDelete={deleteSelected}
          />
        )}

        {/* tool row */}
        <div className="flex flex-wrap items-center gap-2">
          <ToolButton
            active={tool === "marker"}
            onClick={() => {
              setTool("marker");
              setSelected(-1);
            }}
            label="Marker"
          >
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: INK[ink] }}
            />{" "}
            Marker
          </ToolButton>
          <ToolButton
            active={tool === "text"}
            onClick={() => {
              setTool("text");
              setSelected(-1);
            }}
            label="Text"
          >
            🅰 Text
          </ToolButton>
          <ToolButton
            active={tool === "sticker"}
            onClick={() => setSheetOpen((o) => !o)}
            label="Stickers"
          >
            {armedEmoji ?? "⭐"} Stickers
          </ToolButton>
          <ToolButton
            active={tool === "tweezers"}
            onClick={() => setTool("tweezers")}
            label="Select and move"
          >
            👆 Move
          </ToolButton>

          {/* text options inline when the text tool is in hand */}
          {tool === "text" && (
            <div className="flex items-center gap-2 pl-1">
              <select
                value={font}
                onChange={(e) => {
                  const f = e.target.value as (typeof FONTS)[number];
                  loadFont(f);
                  setFont(f);
                }}
                aria-label="Text font"
                className="rounded-sm border border-slate-600 bg-slate-800 px-1.5 py-1 text-sm text-slate-100"
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              {INKS.map((k) => (
                <Swatch
                  key={k}
                  colour={INK[k]}
                  on={ink === k}
                  round
                  onClick={() => setInk(k)}
                  label={`${k} ink`}
                />
              ))}
            </div>
          )}

          {/* marker options inline when the marker is in hand */}
          {tool === "marker" && (
            <div className="flex items-center gap-2 pl-1">
              {INKS.map((k) => (
                <Swatch
                  key={k}
                  colour={INK[k]}
                  on={ink === k}
                  round
                  onClick={() => setInk(k)}
                  label={`${k} ink`}
                />
              ))}
              <label className="flex items-center gap-1 text-xs text-slate-400">
                size
                <input
                  type="range"
                  min={3}
                  max={24}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  aria-label="Marker size"
                />
              </label>
            </div>
          )}
        </div>

        {/* pull-up sticker sheet */}
        {sheetOpen && (
          <div className="mt-2 flex flex-wrap gap-1 rounded-md bg-slate-800/80 p-2">
            {STICKER_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => pickSticker(emoji)}
                className="rounded-sm px-1.5 py-1 text-2xl hover:bg-slate-700"
                aria-label={`Sticker ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* note settings: paper colour + tilt + curl */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-slate-400">paper</span>
            {PAPER_COLOURS.map((c) => (
              <Swatch
                key={c}
                colour={PAPER[c as PaperColour]}
                on={content.colour === c}
                onClick={() => setContent((n) => ({ ...n, colour: c }))}
                label={`${c} paper`}
              />
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-slate-400">
            tilt
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={content.rotation}
              onChange={(e) =>
                setContent((n) => ({ ...n, rotation: Number(e.target.value) }))
              }
              aria-label="Note tilt"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-400">
            curl
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={content.curl.br}
              onChange={(e) => {
                const v = Number(e.target.value);
                setContent((n) => ({ ...n, curl: { bl: v * 0.7, br: v } }));
              }}
              aria-label="Corner curl"
            />
          </label>
        </div>

        {/* submit — choosing a fastener IS pinning the note up */}
        <div className="mt-3 border-t border-slate-700 pt-3">
          <p className="mb-1.5 text-xs text-slate-400">
            {status === "posting"
              ? "Pinning it up…"
              : "Press a fastener to pin your note to the wall:"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FASTENERS_UI.map((f) => (
              <button
                key={f.key}
                type="button"
                disabled={status !== "editing"}
                onClick={() => submit(f.key)}
                aria-label={`Pin with ${f.label}`}
                className="flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 hover:border-emerald-400 hover:bg-slate-700 disabled:opacity-50"
              >
                {PIN_DOT[f.key] && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: PIN_DOT[f.key] }}
                  />
                )}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectionBox({ el }: { el: Element }) {
  const b = bounds(el);
  return (
    <rect
      x={b.x0}
      y={b.y0}
      width={Math.max(0, b.x1 - b.x0)}
      height={Math.max(0, b.y1 - b.y0)}
      fill="none"
      stroke="#34d399"
      strokeWidth={3}
      strokeDasharray="8 5"
    />
  );
}

function SelectedControls({
  el,
  onChange,
  onDelete,
}: {
  el: Element;
  onChange: (next: Element) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-slate-800/80 p-2 text-xs text-slate-300">
      {el.type === "sticker" && (
        <>
          <label className="flex items-center gap-1">
            scale
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={el.scale}
              onChange={(e) =>
                onChange({ ...el, scale: Number(e.target.value) })
              }
              aria-label="Sticker scale"
            />
          </label>
          <RotateControl el={el} onChange={onChange} />
        </>
      )}
      {el.type === "text" && (
        <>
          <label className="flex items-center gap-1">
            font
            <select
              value={el.font}
              onChange={(e) => {
                const f = e.target.value as TextEl["font"];
                loadFont(f);
                onChange({ ...el, font: f });
              }}
              className="rounded-sm border border-slate-600 bg-slate-900 px-1 py-0.5 text-slate-100"
              aria-label="Text font"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            {INKS.map((k) => (
              <Swatch
                key={k}
                colour={INK[k]}
                on={el.color === k}
                round
                onClick={() => onChange({ ...el, color: k })}
                label={`${k} text`}
              />
            ))}
          </div>
          <label className="flex items-center gap-1">
            size
            <input
              type="range"
              min={8}
              max={96}
              value={el.fontSize}
              onChange={(e) =>
                onChange({ ...el, fontSize: Number(e.target.value) })
              }
              aria-label="Text size"
            />
          </label>
          <RotateControl el={el} onChange={onChange} />
        </>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto rounded-sm border border-rose-500/60 px-2 py-1 text-rose-300 hover:bg-rose-500/20"
      >
        🗑 Remove
      </button>
    </div>
  );
}

// Text and sticker carry a rotation; strokes do not.
function RotateControl({
  el,
  onChange,
}: {
  el: TextEl | Extract<Element, { type: "sticker" }>;
  onChange: (next: Element) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      rotate
      <input
        type="range"
        min={-180}
        max={180}
        value={el.rotation}
        onChange={(e) => onChange({ ...el, rotation: Number(e.target.value) })}
        aria-label="Rotation"
      />
    </label>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
        active
          ? "border-emerald-400 bg-emerald-400/15 text-white"
          : "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function Swatch({
  colour,
  on,
  onClick,
  label,
  round,
}: {
  colour: string;
  on: boolean;
  onClick: () => void;
  label: string;
  round?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`h-7 w-7 border-2 ${round ? "rounded-full" : "rounded-sm"} ${
        on ? "border-white" : "border-transparent"
      }`}
      style={{ background: colour }}
    />
  );
}
