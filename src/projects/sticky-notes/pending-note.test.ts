import { describe, expect, it } from "vitest";
import type { NoteContent } from "./note-schema";
import { isApproved, type PendingNote } from "./pending-note";

function content(over?: Partial<NoteContent>): NoteContent {
  return {
    version: 1,
    w: 500,
    h: 500,
    colour: "yellow",
    rotation: 0,
    curl: { bl: 0, br: 0 },
    fastener: "none",
    elements: [],
    ...over,
  };
}

describe("isApproved", () => {
  const pending: PendingNote = {
    author: "sam",
    content: content(),
    submittedAt: 1,
  };

  it("matches an approved note with the same author and content", () => {
    expect(isApproved(pending, [{ author: "sam", content: content() }])).toBe(
      true,
    );
  });

  it("ignores an approved note by a different author", () => {
    expect(isApproved(pending, [{ author: "lee", content: content() }])).toBe(
      false,
    );
  });

  it("matches despite reordered object keys (the jsonb round-trip)", () => {
    // Postgres jsonb does not preserve key order, so the approved copy comes back
    // with keys in a different order than the editor stored. Reconciliation must
    // still match — hence canonical (key-sorted) comparison, not raw stringify.
    const reordered = {
      elements: [],
      curl: { br: 0, bl: 0 },
      fastener: "none",
      rotation: 0,
      colour: "yellow",
      h: 500,
      w: 500,
      version: 1,
    } as unknown as NoteContent;
    expect(isApproved(pending, [{ author: "sam", content: reordered }])).toBe(
      true,
    );
  });

  it("ignores an approved note whose content differs", () => {
    expect(
      isApproved(pending, [
        { author: "sam", content: content({ colour: "pink" }) },
      ]),
    ).toBe(false);
  });

  it("is false against an empty approved list", () => {
    expect(isApproved(pending, [])).toBe(false);
  });
});
