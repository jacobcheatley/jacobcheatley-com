import { coverLeftNote, coverNote, coverRightNote } from "./cover-note";
import { CORK_BG, NoteRender, pinnedNoteStyle } from "./note-render";

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
        <NoteRender content={coverLeftNote} />
      </div>
      <div
        className="absolute right-[-22%] bottom-[-10%] h-[70%]"
        style={pinnedNoteStyle(coverRightNote)}
      >
        <NoteRender content={coverRightNote} />
      </div>
      <div className="relative h-[85%]" style={pinnedNoteStyle(coverNote)}>
        <NoteRender content={coverNote} />
      </div>
    </div>
  );
}
