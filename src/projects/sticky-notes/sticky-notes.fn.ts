import { createServerFn } from "@tanstack/react-start";
import { noteSchema } from "./note-schema";
import { addNote, listApprovedNotes } from "./sticky-notes.server";

// Thin wrappers over the helpers: server functions cannot run in Vitest (no
// Start context), so the helpers and the schema carry the tests.
export const listNotesFn = createServerFn({ method: "GET" }).handler(() =>
  listApprovedNotes(),
);

// `.validator(noteSchema)` re-validates on the server: the trust boundary.
export const addNoteFn = createServerFn({ method: "POST" })
  .validator(noteSchema)
  .handler(async ({ data }) => {
    await addNote(data);
    return { status: "pending" as const };
  });
