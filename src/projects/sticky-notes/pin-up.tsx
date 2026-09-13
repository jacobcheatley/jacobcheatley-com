import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { EASE_OUT, SLIDE_MS, STILL, TAPE } from "./desk";
import { SHAKE_MS } from "./desk-objects";
import { FONT_FAMILIES } from "./note-fonts";
import { FastenerPreview } from "./note-render";
import {
  FASTENERS,
  type Fastener,
  type NoteContent,
  noteSchema,
  type PaperColour,
} from "./note-schema";
import { savePending } from "./pending-note";
import { addNoteFn } from "./sticky-notes.fn";

// Pinning a note up (#77): what happens between the mat and the wall. The
// editor keeps the note and decides when; this file is the pieces it wears —
// the tape labels, the note's flight onto the wall, and the pinning phase over
// the wall: the fastener drawer.

// Everything but `none`, which is what you get by not choosing. TS reads the
// `!== "none"` test as narrowing the list's type, so no cast is needed.
const CHOICES = FASTENERS.filter((f) => f !== "none");

// What a fastener is called out loud: the drawer's buttons, for a screen reader.
const FASTENER_NAMES: Record<(typeof CHOICES)[number], string> = {
  "pin-red": "a red pin",
  "pin-green": "a green pin",
  "pin-yellow": "a yellow pin",
  "pin-blue": "a blue pin",
  "tape-masking": "masking tape",
  "tape-clear": "clear tape",
  staple: "a staple",
  staples: "two staples",
  stick: "sticky tack",
};

// A cardboard box of stationery; each fastener lies in a compartment of its own.
const TRAY: CSSProperties = {
  background: "linear-gradient(180deg, #dcc394, #c3a26b)",
  boxShadow:
    "0 -12px 30px rgba(0,0,0,.45), inset 0 2px 0 rgba(255,255,255,.35)",
};
const COMPARTMENT: CSSProperties = {
  background: "#a9864f",
  boxShadow: "inset 0 3px 6px rgba(0,0,0,.4)",
};

// The pinning phase, over the wall. Portalled out of the editor: the editor
// lives inside the mat, which is off-screen and inert by now, and whose
// transform would make `fixed` mean "fixed to the mat". The drawer goes to the
// body; the tag hangs in the slot the wall leaves under the landed note, so it
// sits under it wherever the wall's layout puts it.
export function PinUp({
  content,
  onChange,
  onBack,
  onPinned,
}: {
  content: NoteContent;
  onChange: (note: NoteContent) => void;
  // abandon the pin: the note goes back to the mat, unfastened
  onBack: () => void;
  // the note is on the server: clear the mat for the next one
  onPinned: () => void;
}) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: a second Enter can arrive before a re-render would have
  // told it the first one is already on its way.
  const sending = useRef(false);
  // Held here rather than on the tag, which is put away while the drawer is
  // open again: a name half typed survives choosing another fastener.
  const [name, setName] = useState("");
  // `useServerFn` wraps the server fn for a component: the same call, run
  // through the router, so a redirect from the server would be followed.
  const addNote = useServerFn(addNoteFn);
  // The wall renders the slot in the same commit this mounts in, so it is
  // there to be found once that commit has landed.
  const [tagSlot, setTagSlot] = useState<Element | null>(null);
  useEffect(() => {
    setTagSlot(document.querySelector("[data-landing-tag]"));
  }, []);

  // Sign the tag: the one POST. Returns false when there is no name to sign
  // with, so the tag can shake — the name is the only half being typed here.
  function sign(): boolean {
    const note = noteSchema.safeParse({ author: name, content });
    if (!note.success) {
      if (note.error.issues.some((issue) => issue.path[0] === "author"))
        return false;
      // The content is past a cap the editor doesn't police (the byte size):
      // say so, rather than shake at a name that was fine.
      setError("too much on this note to pin up");
      return true;
    }
    if (sending.current) return true;
    sending.current = true;
    setError(null);
    addNote({ data: note.data }).then(
      () => {
        // Pending first, then the wall: its pending tile is already written
        // when the landed note goes, so it takes the same slot in one frame.
        savePending({ ...note.data, submittedAt: Date.now() });
        onPinned();
        // replace: Back from the wall shouldn't reopen a note that was sent
        navigate({ to: "/sticky-notes", replace: true });
      },
      () => {
        sending.current = false;
        setError("it didn't stick — try again");
      },
    );
    return true;
  }

  return (
    <>
      {createPortal(
        <>
          {/* Stuck where "pin it up" was. Not once the note is on its way:
              a POST that lands after it went back would clear the mat under
              it. */}
          <TapeLabel
            onClick={() => {
              if (!sending.current) onBack();
            }}
            className="fixed top-3 right-3 z-50"
          >
            back to the desk
          </TapeLabel>
          <FastenerDrawer
            open={drawerOpen}
            colour={content.colour}
            onChoose={(fastener) => {
              onChange({ ...content, fastener });
              setDrawerOpen(false);
            }}
            onClose={() => setDrawerOpen(false)}
            onOpen={() => setDrawerOpen(true)}
          />
        </>,
        document.body,
      )}
      {tagSlot &&
        !drawerOpen &&
        createPortal(
          <NameTag name={name} error={error} onName={setName} onSign={sign} />,
          tagSlot,
        )}
    </>
  );
}

// The paper tag under the landed note: whoever pinned it writes their name, and
// that is the submit. A form, so Enter in the field and the tick (for a thumb,
// which has no Enter to hand) are the same native submit.
function NameTag({
  name,
  error,
  onName,
  onSign,
}: {
  name: string;
  // why the last signing didn't take, written on the tag itself
  error: string | null;
  onName: (name: string) => void;
  onSign: () => boolean;
}) {
  // A blank tag rocks for a moment instead of going anywhere.
  const [shake, setShake] = useState(false);
  return (
    <form
      data-shake={shake || undefined}
      onSubmit={(e) => {
        e.preventDefault(); // a real submit would reload the page
        if (!onSign()) setShake(true);
      }}
      onAnimationEnd={() => setShake(false)}
      className="relative mt-3 flex max-w-56 flex-wrap items-center gap-x-1 rounded-sm py-1 pr-1 pl-3 motion-reduce:animate-none!"
      style={{
        background: "linear-gradient(180deg, #fffdf6, #efe6d2)",
        boxShadow: "0 3px 6px rgba(0,0,0,.35)",
        // `rotate`, not `transform`: the shake animates the transform
        rotate: "2deg",
        animation: shake ? `desk-shake ${SHAKE_MS}ms ease-in-out` : undefined,
      }}
    >
      <input
        aria-label="Your name"
        placeholder="your name"
        value={name}
        onChange={(e) => onName(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={50}
        // 18px: under 16 and iOS zooms the page in on focus
        className="w-32 border-0 border-[#c9bda3] border-b bg-transparent p-0 text-[#3a3226] text-lg lowercase outline-none placeholder:text-[#a89c84]"
        style={{ fontFamily: FONT_FAMILIES.casual }}
      />
      <button
        type="submit"
        aria-label="Sign the tag"
        className="h-10 w-10 shrink-0 border-0 bg-transparent p-0 text-[#28714a] text-xl"
      >
        ✓
      </button>
      {error && (
        <p
          role="alert"
          className="m-0 basis-full pr-2 pb-1 text-[#b3261e] text-base leading-tight"
          style={{ fontFamily: FONT_FAMILIES.casual }}
        >
          {error}
        </p>
      )}
    </form>
  );
}

// The fastener drawer: rises from the bottom as the note lands, shows the nine
// fasteners as they will look on this very paper, and folds away to a tab once
// one is chosen — or when it is put away without one, which leaves `none`.
function FastenerDrawer({
  open,
  colour,
  onChoose,
  onClose,
  onOpen,
}: {
  open: boolean;
  colour: PaperColour;
  onChoose: (fastener: Fastener) => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  return (
    <>
      <section
        aria-label="Fastener drawer"
        // folded away, its compartments are out of reach as well as sight
        inert={!open}
        // `starting:` is CSS @starting-style: the drawer's first frame is below
        // the screen, so it rises into place instead of just being there.
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md px-3 starting:translate-y-full ${open ? "translate-y-0" : "translate-y-full"} ${STILL}`}
        style={{ transition: `translate ${SLIDE_MS}ms ${EASE_OUT}` }}
      >
        <div
          className="rounded-t-md px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={TRAY}
        >
          <div className="flex justify-end">
            <button
              type="button"
              aria-label="Put the drawer away"
              onClick={onClose}
              className="h-10 w-10 border-0 bg-transparent p-0 font-sans text-2xl text-[#5c4523] leading-none"
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {CHOICES.map((fastener) => (
              <button
                key={fastener}
                type="button"
                aria-label={`Fasten it with ${FASTENER_NAMES[fastener]}`}
                onClick={() => onChoose(fastener)}
                className="block rounded-sm border-0 px-1 pt-3 pb-1"
                style={COMPARTMENT}
              >
                <FastenerPreview fastener={fastener} colour={colour} />
              </button>
            ))}
          </div>
        </div>
      </section>
      {!open && (
        <button
          type="button"
          aria-label="Open the fastener drawer"
          onClick={onOpen}
          className="-translate-x-1/2 fixed bottom-0 left-1/2 z-50 min-h-11 rounded-t-md border-0 px-5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] text-[#5c4523] text-lg"
          style={{ ...TRAY, fontFamily: FONT_FAMILIES.casual }}
        >
          fasteners
        </button>
      )}
    </>
  );
}

// A strip of masking tape with a word on it, in the casual hand: the desk's own
// buttons ("pin it up", "back to the desk"), stuck on rather than printed.
export function TapeLabel({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-0 px-4 py-1.5 text-[1.1875rem] leading-snug ${className}`}
      style={{ ...TAPE, color: "#4a412c", fontFamily: FONT_FAMILIES.casual }}
    >
      {children}
    </button>
  );
}

// The note's flight from the mat into its slot on the wall: a FLIP. The wall
// has already laid the landed note out where it belongs (Last); it is put back
// over where the sheet lay on the mat (First, measured before the wall
// changed) by an inverse transform (Invert), which is then let go under a
// transition (Play). No animation library (#69).
export function flyToLanding(from: DOMRect | undefined): void {
  // The newest slot is at the top of the wall, so that is where to look.
  window.scrollTo(0, 0);
  const tile = document.querySelector<HTMLElement>("[data-landing]");
  const to = tile?.getBoundingClientRect();
  if (!tile || !from || !to?.width) return; // nothing laid out (jsdom)
  const scale = from.width / to.width;
  // A wall tile is taller than its paper by the fastener's headroom, all of it
  // above the sheet, so the sheet's centre sits half that headroom below the
  // tile's — and that offset grows with the scale.
  // ponytail: centres off the rotated bounding boxes, which is out by a pixel
  // or two at the steepest tilt; unrotate the boxes if the landing ever shows
  // a nudge.
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy =
    from.top +
    from.height / 2 -
    (to.top + to.height / 2) -
    (scale * (to.height - to.width)) / 2;
  tile.style.transition = "none";
  tile.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  // Reading layout here makes the browser take the start position before the
  // end one, or the two collapse into no motion at all.
  tile.getBoundingClientRect();
  tile.style.transition = `transform ${SLIDE_MS}ms ${EASE_OUT}`;
  tile.style.transform = "";
}
