import { createServerFn } from "@tanstack/react-start";
import { noteSchema } from "./note-schema";
import { addNote, listApprovedNotes } from "./sticky-notes.server";

// Thin server-function wrappers over the helpers. Server functions cannot run
// in Vitest (no Start context), so the helpers and schema carry the tests. The
// wall (#60) consumes listNotesFn; the editor (#61) consumes addNoteFn.
export const listNotesFn = createServerFn({ method: "GET" }).handler(() =>
  listApprovedNotes(),
);

// `.validator(noteSchema)` re-validates on the server: the trust boundary. The
// note stays pending until the approval CLI approves it.
export const addNoteFn = createServerFn({ method: "POST" })
  .validator(noteSchema)
  .handler(async ({ data }) => {
    await addNote(data);
    return { status: "pending" as const };
  });
