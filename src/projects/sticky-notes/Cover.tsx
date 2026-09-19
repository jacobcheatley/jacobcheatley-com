import { coverNote } from "./cover-note";
import { CORK_BG, NoteRender, pinnedNoteStyle } from "./note-render";

export function Cover() {
  return (
    <div className="flex size-full items-center justify-center" style={CORK_BG}>
      <div className="h-[85%]" style={pinnedNoteStyle(coverNote)}>
        <NoteRender content={coverNote} />
      </div>
    </div>
  );
}
