import type { CSSProperties } from "react";
import { coverLeftNote, coverNote, coverRightNote } from "./cover-note";
import {
  CORK_BG,
  FASTENER_MARGIN,
  NoteRender,
  pinnedNoteStyle,
} from "./note-render";
import { CANVAS } from "./note-schema";

// A hover nudges the Notes: each swings a little further from rest, neighbours
// opposite ways. The swing pivots at the paper's top edge, below the fastener
// headroom, apart from the rest rotation about the centre that places the Note.
const SWAY = "size-full transition-transform duration-[350ms] ease-spring";
const SWAY_CLOCKWISE = `${SWAY} motion-safe:group-hover:rotate-3 motion-safe:group-focus-visible:rotate-3`;
const SWAY_ANTICLOCKWISE = `${SWAY} motion-safe:group-hover:-rotate-3 motion-safe:group-focus-visible:-rotate-3`;
const SWAY_PIVOT: CSSProperties = {
  transformOrigin: `50% ${(100 * FASTENER_MARGIN) / (CANVAS + FASTENER_MARGIN)}%`,
};

export function Cover() {
  return (
    <div
      className="relative flex size-full items-center justify-center"
      style={CORK_BG}
    >
      <div
        className="absolute top-[-8%] left-[-22%] h-[70%]"
        style={pinnedNoteStyle(coverLeftNote)}
      >
        <div className={SWAY_CLOCKWISE} style={SWAY_PIVOT}>
          <NoteRender content={coverLeftNote} />
        </div>
      </div>
      <div
        className="absolute right-[-22%] bottom-[-10%] h-[70%]"
        style={pinnedNoteStyle(coverRightNote)}
      >
        <div className={SWAY_CLOCKWISE} style={SWAY_PIVOT}>
          <NoteRender content={coverRightNote} />
        </div>
      </div>
      <div className="relative h-[85%]" style={pinnedNoteStyle(coverNote)}>
        <div className={SWAY_ANTICLOCKWISE} style={SWAY_PIVOT}>
          <NoteRender content={coverNote} />
        </div>
      </div>
    </div>
  );
}
