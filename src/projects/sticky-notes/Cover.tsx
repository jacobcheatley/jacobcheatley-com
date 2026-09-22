import { coverLeftNote, coverNote, coverRightNote } from "./cover-note";
import { CORK_BG, NoteRender, pinnedNoteStyle } from "./note-render";

// A hover nudges the Notes on their fasteners: each swings a little further
// from rest, neighbours opposite ways, and overshoots like paper on a pin. The
// swing pivots at the fastener, apart from the rest rotation about the centre
// that places the Note.
const SWAY =
  "size-full origin-top transition-transform duration-[350ms] ease-spring";
const SWAY_CLOCKWISE = `${SWAY} motion-safe:group-hover:rotate-3 motion-safe:group-focus-visible:rotate-3`;
const SWAY_ANTICLOCKWISE = `${SWAY} motion-safe:group-hover:-rotate-3 motion-safe:group-focus-visible:-rotate-3`;

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
        <div className={SWAY_CLOCKWISE}>
          <NoteRender content={coverLeftNote} />
        </div>
      </div>
      <div
        className="absolute right-[-22%] bottom-[-10%] h-[70%]"
        style={pinnedNoteStyle(coverRightNote)}
      >
        <div className={SWAY_CLOCKWISE}>
          <NoteRender content={coverRightNote} />
        </div>
      </div>
      <div className="relative h-[85%]" style={pinnedNoteStyle(coverNote)}>
        <div className={SWAY_ANTICLOCKWISE}>
          <NoteRender content={coverNote} />
        </div>
      </div>
    </div>
  );
}
