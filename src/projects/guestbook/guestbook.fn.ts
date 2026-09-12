import { createServerFn } from "@tanstack/react-start";
import { entrySchema } from "./entry-schema";
import { addEntry, listApprovedEntries } from "./guestbook.server";

// Thin server-function wrappers over the helpers. Server functions cannot run
// in Vitest (no Start context), so the helpers and schema carry the tests.
export const listEntriesFn = createServerFn({ method: "GET" }).handler(() =>
  listApprovedEntries(),
);

// `.validator(entrySchema)` re-validates on the server: the trust boundary. The
// entry stays pending until the moderation CLI approves it.
export const addEntryFn = createServerFn({ method: "POST" })
  .validator(entrySchema)
  .handler(async ({ data }) => {
    await addEntry(data);
    return { status: "pending" as const };
  });
