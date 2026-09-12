import { createServerFn } from "@tanstack/react-start";
import { listApprovedEntries } from "./guestbook.server";

// Thin server-function wrapper over the helper. Server functions cannot run in
// Vitest (no Start context), so the helper carries the tests.
export const listEntriesFn = createServerFn({ method: "GET" }).handler(() =>
  listApprovedEntries(),
);
