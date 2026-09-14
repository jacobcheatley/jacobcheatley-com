import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteContent } from "./note-schema";
import {
  isApproved,
  MAX_PENDING,
  type PendingNote,
  readPending,
  reconcilePending,
  savePending,
} from "./pending-note";

// The unit project runs on node, which has no localStorage; the module only
// ever calls these three, so a Map stands in for the whole thing.
const KEY = "sticky-notes:pending";
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
});

beforeEach(() => store.clear());

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

const pendingNote = (author: string, at: number): PendingNote => ({
  author,
  content: content(),
  submittedAt: at,
});

describe("the pending list", () => {
  it("reads back an empty list when nothing is stored", () => {
    expect(readPending()).toEqual([]);
  });

  it("savePending prepends, so the newest note reads first", () => {
    savePending(pendingNote("ada", 1));
    savePending(pendingNote("sam", 2));
    expect(readPending().map((p) => p.author)).toEqual(["sam", "ada"]);
  });

  it("caps the list, dropping the oldest", () => {
    for (let i = 0; i < MAX_PENDING + 5; i++) savePending(pendingNote("a", i));
    const list = readPending();
    expect(list).toHaveLength(MAX_PENDING);
    expect(list[0]?.submittedAt).toBe(MAX_PENDING + 4); // newest kept
  });

  it("reads a legacy single note as a one-element list", () => {
    localStorage.setItem(KEY, JSON.stringify(pendingNote("lee", 7)));
    expect(readPending().map((p) => p.author)).toEqual(["lee"]);
  });

  it("reads garbage as an empty list", () => {
    localStorage.setItem(KEY, "not json at all");
    expect(readPending()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ nope: true }));
    expect(readPending()).toEqual([]);
  });

  it("drops entries that fail the note contract", () => {
    // the wall renders whatever comes back, so a shape-only guard would hand
    // NoteRender a note with no elements array and throw mid-render
    localStorage.setItem(KEY, JSON.stringify([{ content: 42 }]));
    expect(readPending()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify([{ content: content() }]));
    expect(readPending()).toEqual([]); // no author
  });

  it("keeps the valid entries out of a mixed list", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([{ content: 42 }, pendingNote("ada", 1), null]),
    );
    expect(readPending().map((p) => p.author)).toEqual(["ada"]);
  });

  it("reads a legacy entry with no submittedAt", () => {
    const { submittedAt: _, ...legacy } = pendingNote("lee", 7);
    localStorage.setItem(KEY, JSON.stringify([legacy]));
    expect(readPending()).toEqual([{ ...legacy, submittedAt: 0 }]);
  });
});

describe("reconcilePending", () => {
  it("keeps the notes that have not been approved yet and writes back", () => {
    const ada = pendingNote("ada", 1);
    const sam = pendingNote("sam", 2);
    savePending(ada);
    savePending(sam);

    const left = reconcilePending(readPending(), [
      { author: "ada", content: content() },
    ]);
    expect(left.map((p) => p.author)).toEqual(["sam"]);
    // the write-back means the next read agrees
    expect(readPending().map((p) => p.author)).toEqual(["sam"]);
  });

  it("clears the key once every pending note is approved", () => {
    savePending(pendingNote("ada", 1));
    expect(
      reconcilePending(readPending(), [{ author: "ada", content: content() }]),
    ).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
