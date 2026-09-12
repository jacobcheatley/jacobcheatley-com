import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { NOTE_ASPECT_RATIO, NoteRender } from "./note-render";
import type { NoteContent } from "./note-schema";
import {
  clearPending,
  isApproved,
  type PendingNote,
  readPending,
} from "./pending-note";

// The public wall: a corkboard of approved notes, newest-first, that SSRs with
// no client JS needed to view it. Client JS adds only the two dynamic bits —
// tap-to-zoom and the visitor's own pending-note overlay. Rotation lives here in
// CSS around each tile; curl and the fastener are baked into NoteRender itself.

// An approved note as the loader delivers it (extra columns come along unused).
type WallNote = { id: number; author: string; content: NoteContent };

// What a tile/zoom needs — approved notes and the local pending note both fit.
type DisplayNote = { author: string; content: NoteContent; pending?: boolean };

const EDITOR_HREF = "/sticky-notes/new"; // editor route lands with #61

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

function NoteTile({ note, onOpen }: { note: DisplayNote; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Zoom note by ${note.author}`}
      className="relative block w-32 cursor-zoom-in select-none border-0 bg-transparent p-0"
      style={{
        aspectRatio: NOTE_ASPECT_RATIO,
        // The note's own rotation; the shadow follows the paper silhouette (curl
        // cut-outs and all), so a drop-shadow filter, not a rectangular box one.
        transform: `rotate(${note.content.rotation}deg)`,
        filter: "drop-shadow(2px 4px 5px rgba(0,0,0,.35))",
      }}
    >
      <NoteRender content={note.content} />
      {note.pending && (
        <span className="absolute -top-1 right-1 rounded-sm bg-black/70 px-1.5 py-0.5 font-sans text-[0.6rem] font-semibold tracking-wide text-white uppercase">
          Pending
        </span>
      )}
    </button>
  );
}

function Lightbox({
  note,
  onClose,
}: {
  note: DisplayNote;
  onClose: () => void;
}) {
  // Move focus into the dialog on open, so Esc and the close button are reachable
  // by keyboard right away.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // The backdrop is a real button (the tap-out target); the note and caption
  // sit layered above it, so clicking them never reaches the backdrop and no
  // static element needs a click handler. Esc is handled by the parent.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Note by ${note.author}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close note"
        className="absolute inset-0 h-full w-full cursor-zoom-out border-0 bg-black/70"
      />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close note"
        className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full border-0 bg-white/15 font-sans text-2xl leading-none text-white hover:bg-white/25"
      >
        ×
      </button>
      <div
        className="relative z-10 w-[min(85vmin,520px)] select-none"
        style={{
          aspectRatio: NOTE_ASPECT_RATIO,
          filter: "drop-shadow(0 12px 30px rgba(0,0,0,.5))",
        }}
      >
        <NoteRender content={note.content} />
      </div>
      <p className="relative z-10 font-sans text-sm text-white/90">
        — {note.author}
        {note.pending && " · pending approval"}
      </p>
    </div>
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
    <a
      href={EDITOR_HREF}
      aria-label="Pin a note"
      className={`block select-none no-underline ${empty ? "w-56" : "w-32"}`}
      style={{
        aspectRatio: NOTE_ASPECT_RATIO,
        transform: `rotate(${content.rotation}deg)`,
        filter: "drop-shadow(2px 4px 5px rgba(0,0,0,.35))",
      }}
    >
      <NoteRender content={content} />
    </a>
  );
}

export function StickyWall({ notes }: { notes: WallNote[] }) {
  const [zoomed, setZoomed] = useState<DisplayNote | null>(null);
  const [pending, setPending] = useState<PendingNote | null>(null);

  // Own pending note lives only in this browser, so read it after mount (SSR has
  // no localStorage) and drop it the moment it shows up approved in the list.
  useEffect(() => {
    const p = readPending();
    const reconciled = p !== null && isApproved(p, notes);
    if (reconciled) clearPending();
    setPending(reconciled ? null : p);
  }, [notes]);

  // Esc closes the zoom lightbox (tap-out is handled on the scrim itself).
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const empty = notes.length === 0 && !pending;

  return (
    <div
      className="flex min-h-dvh flex-col items-center px-4 pb-16"
      style={CORK_BG}
    >
      <header className="flex w-full max-w-[64rem] items-baseline justify-between gap-4 py-6">
        <h1 className="font-serif text-2xl text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.5)]">
          Sticky Notes
        </h1>
        <Link
          to="/"
          className="font-sans text-sm text-white/80 no-underline hover:text-white hover:underline"
        >
          ← jacobcheatley.com
        </Link>
      </header>

      <ul className="flex w-full max-w-[64rem] flex-wrap justify-center gap-6 py-4">
        {/* first slot: the wall is newest-first, so "add a note" leads */}
        <li>
          <AddNote empty={empty} />
        </li>
        {pending && (
          <li>
            <NoteTile
              note={{ ...pending, pending: true }}
              onOpen={() => setZoomed({ ...pending, pending: true })}
            />
          </li>
        )}
        {notes.map((n) => (
          <li key={n.id}>
            <NoteTile note={n} onOpen={() => setZoomed(n)} />
          </li>
        ))}
      </ul>

      {zoomed && <Lightbox note={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  );
}
