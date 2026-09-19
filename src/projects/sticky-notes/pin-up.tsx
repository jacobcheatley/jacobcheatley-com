import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { flyingFrom } from "./desk";
import { SHAKE_MS, TapeLabel } from "./desk-objects";
import { FONT_FAMILIES } from "./note-fonts";
import { FastenerPreview } from "./note-render";
import { FASTENERS, type NoteContent, noteSchema } from "./note-schema";
import { savePending } from "./pending-note";
import { Spotlight } from "./Spotlight";
import { addNoteFn } from "./sticky-notes.fn";

// Everything but `none`, which is what you get by not choosing. TS infers the
// `!== "none"` filter as a type predicate, so no cast is needed.
const CHOICES = FASTENERS.filter((f) => f !== "none");

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

// The pinning scene, over the wall. Portalled out of the editor, which lives
// inside the mat, whose transform would make the Spotlight's `fixed` mean
// "fixed to the mat".
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
  const [error, setError] = useState<string | null>(null);
  // A ref for the guard: a second Enter can arrive before a re-render would have
  // told it the first is already on its way. `posting` is the same fact for
  // rendering: the fasteners are shut while it is true.
  const sending = useRef(false);
  const [posting, setPosting] = useState(false);
  // Whether this pin is still the one going on: a POST can outlive the unmount,
  // and what arrives then must leave the mat and the URL to whatever came next.
  // Set in the effect, so StrictMode's rehearsal remount leaves it true.
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // Held here rather than on the tag, so nothing in the scene can drop a name
  // half typed.
  const [name, setName] = useState("");
  // Through the router, so a redirect from the server would be followed.
  const addNote = useServerFn(addNoteFn);

  // The Spotlight puts the keyboard nowhere of its own when it has no ×, so the
  // way back takes it as the mat slides out from under the scene.
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus();
  }, []);

  // Escape is the tape label by another name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not once the note is on its way: going back would leave it both pending
      // and on the mat, to be pinned up twice.
      if (e.key === "Escape" && !sending.current) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  // Sign the tag: the one POST. Returns false when there is no name to sign
  // with, so the tag can shake.
  function sign(): boolean {
    const note = noteSchema.safeParse({ author: name, content });
    if (!note.success) {
      if (note.error.issues.some((issue) => issue.path[0] === "author"))
        return false;
      // The content is past a cap the editor doesn't police (the byte size):
      // say so, rather than shake at a name that was fine.
      // ponytail: the visitor only learns at the signing; a live size check in
      // the editor would refuse the mark that tips the note over.
      setError("too much on this note to pin up");
      return true;
    }
    if (sending.current) return true;
    sending.current = true;
    setPosting(true);
    setError(null);
    addNote({ data: note.data }).then(
      () => {
        // Where the note is flying home from, taken while it still hangs in the
        // Spotlight.
        const from = document
          .querySelector("[data-spotlight]")
          ?.getBoundingClientRect();
        // Pending first: the tile is written before the Spotlight goes, so there
        // is a slot to fly into. It is on the server whether or not this pin is
        // still going on, so it is pending either way.
        savePending({ ...note.data, submittedAt: Date.now() });
        if (!live.current) return;
        // The tile it flies home into is laid out by the wall, a navigation and a
        // commit from here, so the wall flies it: this leaves it the measurement
        // it cannot take for itself.
        flyingFrom(from);
        onPinned();
        // replace: Back from the wall shouldn't reopen a note that was sent
        navigate({ to: "/sticky-notes", replace: true });
      },
      () => {
        sending.current = false;
        setPosting(false);
        setError("it didn't stick — try again");
      },
    );
    return true;
  }

  return createPortal(
    <Spotlight content={content} label="Pin it up">
      {/* `order-first` rather than a box hung off the paper: the Spotlight
          stacks what hangs under the note, and this is the one thing that hangs
          over it, so it takes the same gap and cannot overlap. Every child
          needs `relative z-10` to sit above the scrim. */}
      <TapeLabel
        ref={back}
        onClick={() => {
          if (!sending.current) onBack();
        }}
        className="relative z-10 order-first"
      >
        back to the desk
      </TapeLabel>
      <div className="relative z-10 flex flex-wrap justify-center gap-2">
        {CHOICES.map((fastener) => (
          <button
            key={fastener}
            type="button"
            // the note is on its way: what was posted is what stays on it
            disabled={posting}
            aria-pressed={content.fastener === fastener}
            aria-label={`Fasten it with ${FASTENER_NAMES[fastener]}`}
            onClick={() => onChange({ ...content, fastener })}
            className="h-12 w-14 border-0 bg-transparent p-0 sm:w-24"
          >
            <FastenerPreview fastener={fastener} colour={content.colour} />
          </button>
        ))}
      </div>
      <NameTag
        name={name}
        error={error}
        sending={posting}
        onName={setName}
        onSign={sign}
      />
    </Spotlight>,
    document.body,
  );
}

// The paper tag under the note: whoever pinned it writes their name, and that is
// the submit. Not a form, and the tick is a plain button: a lone field in a form
// is what a password manager reads as a login. Enter in the field signs it too.
function NameTag({
  name,
  error,
  sending,
  onName,
  onSign,
}: {
  name: string;
  // why the last signing didn't take, written on the tag itself
  error: string | null;
  sending: boolean;
  onName: (name: string) => void;
  onSign: () => boolean;
}) {
  // A blank tag rocks for a moment instead of going anywhere. Stopped on the
  // clock, not `animationend`: under reduced motion there is no animation to end.
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  function signIt() {
    if (onSign()) return;
    setShake(true);
    clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShake(false), SHAKE_MS);
  }

  return (
    <div
      data-shake={shake || undefined}
      aria-busy={sending || undefined}
      // shrink-0: squeezed to the scene's width the tag wraps the tick under
      // the field; it keeps its own width instead
      className="relative z-10 flex max-w-56 shrink-0 flex-wrap items-center gap-x-1 rounded-sm py-1 pr-1 pl-3 motion-reduce:animate-none!"
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
        placeholder="sign here"
        value={name}
        onChange={(e) => onName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") signIt();
        }}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={50}
        // No name, no id, and one opt-out per password manager: nothing here
        // is an identity field, and an autofill bubble over the tag on a phone
        // would cover the note it hangs from.
        data-1p-ignore=""
        data-lpignore="true"
        data-bwignore=""
        data-form-type="other"
        // 18px: under 16 and iOS zooms the page in on focus
        className="w-32 border-0 border-[#c9bda3] border-b bg-transparent p-0 text-[#3a3226] text-lg lowercase outline-none placeholder:text-[#a89c84]"
        style={{ fontFamily: FONT_FAMILIES.casual }}
      />
      <button
        type="button"
        disabled={sending}
        aria-label="Sign the tag"
        onClick={signIt}
        className="h-10 w-10 shrink-0 border-0 bg-transparent p-0 text-[#28714a] text-xl disabled:opacity-40"
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
    </div>
  );
}
