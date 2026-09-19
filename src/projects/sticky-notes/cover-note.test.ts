import { expect, it } from "vitest";
import { coverLeftNote, coverNote, coverRightNote } from "./cover-note";
import { noteContentSchema } from "./note-schema";

it.each([
  ["centre", coverNote],
  ["left", coverLeftNote],
  ["right", coverRightNote],
])("the Cover's %s Note is valid note content", (_, note) => {
  expect(noteContentSchema.parse(note)).toEqual(note);
});
