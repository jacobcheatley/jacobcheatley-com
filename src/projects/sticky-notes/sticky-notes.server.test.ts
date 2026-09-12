import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import type { NoteContent } from "./note-schema";
import { stickyNotes } from "./schema";
import { addNote, listApprovedNotes } from "./sticky-notes.server";

const content: NoteContent = {
  version: 1,
  w: 500,
  h: 500,
  colour: "yellow",
  rotation: 0,
  curl: { bl: 0, br: 0 },
  fastener: "pin",
  elements: [
    { type: "sticker", x: 100, y: 100, emoji: "⭐", scale: 1, rotation: 0 },
  ],
};

describe("addNote", () => {
  it("inserts a pending note, returns its id, and keeps it off the approved list", async () => {
    const id = await addNote({ author: "Ada", content });
    expect(id).toBeGreaterThan(0);

    const [row] = await db.select().from(stickyNotes);
    expect(row?.id).toBe(id);
    expect(row?.approvedAt).toBeNull();
    // The JSONB blob round-trips intact.
    expect(row?.content).toEqual(content);

    expect(await listApprovedNotes()).toHaveLength(0);
  });
});

describe("listApprovedNotes", () => {
  it("excludes pending notes", async () => {
    await db.insert(stickyNotes).values([
      { author: "Approved", content, approvedAt: new Date() },
      { author: "Pending", content },
    ]);

    const rows = await listApprovedNotes();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.author).toBe("Approved");
  });

  it("returns approved notes newest first", async () => {
    await db.insert(stickyNotes).values([
      {
        author: "Older",
        content,
        createdAt: new Date("2020-01-01"),
        approvedAt: new Date(),
      },
      {
        author: "Newer",
        content,
        createdAt: new Date("2024-01-01"),
        approvedAt: new Date(),
      },
    ]);

    const rows = await listApprovedNotes();
    expect(rows.map((r) => r.author)).toEqual(["Newer", "Older"]);
  });

  it("caps the result at the limit", async () => {
    const values = Array.from({ length: 105 }, (_, i) => ({
      author: `Note ${i}`,
      content,
      approvedAt: new Date(),
    }));
    await db.insert(stickyNotes).values(values);

    expect(await listApprovedNotes()).toHaveLength(100);
    expect(await listApprovedNotes(10)).toHaveLength(10);
  });
});
