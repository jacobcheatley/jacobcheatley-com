import { expect, it } from "vitest";
import { coverNote } from "./cover-note";
import { noteContentSchema } from "./note-schema";

it("the Cover's Note is valid note content", () => {
  expect(noteContentSchema.parse(coverNote)).toEqual(coverNote);
});
