import { emptyNote } from "./note-editor";
import type { NoteContent } from "./note-schema";

// The blank note a test starts from, with the randomness taken out: the same
// paper every time, lying square to the screen, so a test states only the
// fields it is about.
export const noteContent = (over?: Partial<NoteContent>): NoteContent => ({
  ...emptyNote(() => 0),
  rotation: 0,
  ...over,
});
