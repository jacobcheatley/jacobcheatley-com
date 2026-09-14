import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { STILL } from "./desk";
import { NOTE_ASPECT_RATIO, NoteRender } from "./note-render";
import type { NoteContent } from "./note-schema";
import {
  type PendingNote,
  readPending,
  reconcilePending,
} from "./pending-note";
import { Spotlight } from "./Spotlight";

// The public wall: a corkboard of approved notes, newest-first, that SSRs with
// no client JS needed to view it. Client JS adds only the two dynamic bits —
// tap-to-zoom and the visitor's own pending-note overlay. Rotation lives here in
// CSS around each tile; curl and the fastener are baked into NoteRender itself.

// An approved note as the loader delivers it (extra columns come along unused).
export type WallNote = { id: number; author: string; content: NoteContent };

// What a tile/zoom needs — approved notes and the local pending note both fit.
type DisplayNote = { author: string; content: NoteContent; pending?: boolean };

// Warm corkboard: a faint stipple of pits over a wood-brown wash. Lifted from
// the visual-direction probe (prototype/49-sticky-look, surface A).
const CORK_BG: CSSProperties = {
  backgroundImage: [
    "radial-gradient(circle at 20% 30%, rgba(0,0,0,.05) 0 2px, transparent 3px)",
    "radial-gradient(circle at 60% 70%, rgba(0,0,0,.06) 0 2px, transparent 3px)",
    "radial-gradient(circle at 80% 20%, rgba(0,0,0,.05) 0 2px, transparent 3px)",
    "radial-gradient(circle at 40% 85%, rgba(0,0,0,.05) 0 2px, transparent 3px)",
    "linear-gradient(135deg, #c99a5b, #b07f3f)",
  ].join(", "),
  backgroundSize: "14px 14px, 22px 22px, 18px 18px, 16px 16px, cover",
};

// A tile's box on the board. The note's own rotation; the shadow follows the
// paper silhouette (curl cut-outs and all), so a drop-shadow filter, not a
// rectangular box one.
const tileStyle = (content: NoteContent): CSSProperties => ({
  aspectRatio: NOTE_ASPECT_RATIO,
  transform: `rotate(${content.rotation}deg)`,
  filter: "drop-shadow(2px 4px 5px rgba(0,0,0,.35))",
});

const PendingBadge = () => (
  <span className="absolute -top-1 right-1 rounded-sm bg-black/70 px-1.5 py-0.5 font-sans text-[0.6rem] font-semibold tracking-wide text-white uppercase">
    Pending
  </span>
);

function NoteTile({ note, onOpen }: { note: DisplayNote; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Zoom note by ${note.author}`}
      className="relative block w-32 cursor-zoom-in select-none border-0 bg-transparent p-0"
      style={tileStyle(note.content)}
    >
      <NoteRender content={note.content} />
      {note.pending && <PendingBadge />}
    </button>
  );
}

// The note being pinned up (#77), in the slot it will hold once submitted: the
// same tile and badge a pending note wears, so the submit swaps one for the
// other without anything moving. Not a zoom button — it has no author yet, and
// it is still being fastened. The pinning UI finds it by `data-landing` (to fly
// it in) and hangs the name tag in `data-landing-tag`.
function LandingTile({ content }: { content: NoteContent }) {
  // Every choice in the drawer hands over a new note, even the same fastener
  // again: count them, so each choice can mount the press afresh. Setting state
  // while rendering is how to follow a prop without an effect (StickyNotes
  // does the same).
  const [press, setPress] = useState({ content, n: 0 });
  if (press.content !== content) setPress({ content, n: press.n + 1 });

  return (
    // z-45: the note flies in over the mat (z-40) as the mat slides away.
    <li data-landing="" className={`relative z-45 ${STILL}`}>
      <div className="relative w-32 select-none" style={tileStyle(content)}>
        {/* Keyed by the choice, so each one mounts afresh and the press-on
            (styles.css, on `data-press`) plays again. */}
        <div
          key={press.n}
          data-press={
            content.fastener === "none" ? undefined : content.fastener
          }
          className="h-full"
        >
          <NoteRender content={content} />
        </div>
        <PendingBadge />
      </div>
      <div
        data-landing-tag=""
        className="absolute inset-x-0 top-full flex justify-center"
      />
    </li>
  );
}

// A blank note carrying the invite copy, pinned with the real pin-red fastener —
// so the affordance renders through the exact same NoteRender path as any note,
// not a look-alike CSS pin.
function inviteContent(text: string, fontSize: number): NoteContent {
  return {
    version: 1,
    w: 500,
    h: 500,
    colour: "yellow",
    rotation: -3,
    curl: { bl: 0, br: 0 },
    fastener: "pin-red",
    elements: [
      {
        type: "text",
        x: 45,
        y: 170,
        w: 420,
        text,
        font: "casual",
        color: "black",
        fontSize,
        rotation: 0,
      },
    ],
  };
}

// The add-a-note affordance IS a diegetic note pinned to the board, and always
// sits first — the slot a new note lands in, since the wall is newest-first.
// Bigger when the board is empty, tile-sized once notes exist.
function AddNote({ empty }: { empty: boolean }) {
  const content = empty
    ? inviteContent("Nothing pinned yet — pin the first note", 46)
    : inviteContent("+ pin\na note", 62);
  return (
    <Link
      // A client push, so the mat slides up over the wall instead of reloading it.
      to="/sticky-notes/new"
      aria-label="Pin a note"
      className={`block select-none no-underline ${empty ? "w-56" : "w-32"}`}
      style={{
        aspectRatio: NOTE_ASPECT_RATIO,
        transform: `rotate(${content.rotation}deg)`,
        filter: "drop-shadow(2px 4px 5px rgba(0,0,0,.35))",
      }}
    >
      <NoteRender content={content} />
    </Link>
  );
}

export function StickyWall({
  notes,
  landing,
}: {
  notes: WallNote[];
  // the note being pinned up, while it is (#77)
  landing?: NoteContent;
}) {
  const [zoomed, setZoomed] = useState<DisplayNote | null>(null);
  const [pending, setPending] = useState<PendingNote[]>([]);

  // Own pending notes live only in this browser, so read them after mount (SSR
  // has no localStorage); each drops the moment it shows up approved. Read
  // again when a landed note goes: a submit has just added it to the list. A
  // layout effect, so the pending tile takes the landed one's slot before the
  // browser paints the gap between them.
  useLayoutEffect(() => {
    if (landing) return;
    setPending(reconcilePending(readPending(), notes));
  }, [notes, landing]);

  // Esc closes the Spotlight (tap-out is handled on the scrim itself).
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const empty = notes.length === 0 && pending.length === 0 && !landing;

  return (
    <div
      className="flex min-h-dvh flex-col items-center px-4 pb-16"
      style={CORK_BG}
    >
      <h1 className="sr-only">Sticky Notes</h1>

      <ul className="flex w-full max-w-[64rem] flex-wrap justify-center gap-6 py-4">
        {/* first slot: the wall is newest-first, so "add a note" leads */}
        <li>
          <AddNote empty={empty} />
        </li>
        {landing && <LandingTile content={landing} />}
        {pending.map((p) => {
          const tile = { ...p, pending: true };
          return (
            <li key={`${p.submittedAt}-${p.author}`}>
              <NoteTile note={tile} onOpen={() => setZoomed(tile)} />
            </li>
          );
        })}
        {notes.map((n) => (
          <li key={n.id}>
            <NoteTile note={n} onOpen={() => setZoomed(n)} />
          </li>
        ))}
      </ul>

      {zoomed && (
        <Spotlight
          content={zoomed.content}
          label={`Note by ${zoomed.author}`}
          onClose={() => setZoomed(null)}
        >
          <p className="relative z-10 font-sans text-sm text-white/90">
            — {zoomed.author}
            {zoomed.pending && " · pending approval"}
          </p>
        </Spotlight>
      )}
    </div>
  );
}
