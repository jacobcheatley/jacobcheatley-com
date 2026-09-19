import { Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { fadeScrim, flyTo, takeFlightHome } from "./desk";
import { loadFont } from "./note-fonts";
import { CORK_BG, NoteRender, pinnedNoteStyle } from "./note-render";
import { CANVAS, type Font, type NoteContent } from "./note-schema";
import {
  type PendingNote,
  readPending,
  reconcilePending,
} from "./pending-note";
import { Spotlight } from "./Spotlight";

// An approved note as the loader delivers it (extra columns come along unused).
export type WallNote = { id: number; author: string; content: NoteContent };

type DisplayNote = { author: string; content: NoteContent; pending?: boolean };

// A note sent from the Spotlight flies home into the newest pending tile, which
// starts the flight as it mounts; any other tile finds no rect waiting. Module
// scope, so the ref never changes and React never re-attaches it.
function flyHome(tile: HTMLLIElement | null) {
  if (tile && flyTo(takeFlightHome(), tile)) fadeScrim();
}

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
      style={pinnedNoteStyle(note.content)}
    >
      <NoteRender content={note.content} />
      {note.pending && <PendingBadge />}
    </button>
  );
}

// The invite copy on a blank note, so the affordance renders through the same
// NoteRender path as any note rather than a look-alike CSS pin.
const INVITE_FONT: Font = "casual";
function inviteContent(text: string, fontSize: number): NoteContent {
  return {
    version: 1,
    w: CANVAS,
    h: CANVAS,
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
        font: INVITE_FONT,
        color: "black",
        fontSize,
        rotation: 0,
      },
    ],
  };
}

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
      style={pinnedNoteStyle(content)}
    >
      <NoteRender content={content} />
    </Link>
  );
}

export function StickyWall({
  notes,
  pinning,
}: {
  notes: WallNote[];
  // the note being pinned up, while it is: the wall shows nothing of it, but it
  // must not re-read its pending notes under a note that has not been sent yet.
  pinning?: NoteContent;
}) {
  const [zoomed, setZoomed] = useState<DisplayNote | null>(null);
  const [pending, setPending] = useState<PendingNote[]>([]);

  // Own pending notes live only in this browser, so read them after mount (SSR
  // has no localStorage), and again when a pinning ends. A layout effect, so the
  // tile the note flies home into is laid out before the wall paints.
  useLayoutEffect(() => {
    if (pinning) return;
    setPending(reconcilePending(readPending(), notes));
  }, [notes, pinning]);

  // Ask for every face a tile shows, plus the invite's; the note webfonts load
  // lazily (note-fonts.ts). No dedupe: a dynamic import() is cached, so a
  // repeat ask costs nothing.
  useEffect(() => {
    loadFont(INVITE_FONT);
    for (const { content } of [...pending, ...notes])
      for (const el of content.elements)
        if (el.type === "text") loadFont(el.font);
  }, [notes, pending]);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const empty = notes.length === 0 && pending.length === 0 && !pinning;

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
        {pending.map((p, i) => {
          const tile = { ...p, pending: true };
          return (
            // The newest holds the slot a sent note flies home into.
            <li
              key={`${p.submittedAtMs}-${p.author}`}
              ref={i === 0 ? flyHome : undefined}
              data-newest={i === 0 ? "" : undefined}
            >
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
