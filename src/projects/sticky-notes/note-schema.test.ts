import { describe, expect, it } from "vitest";
import { type NoteContent, noteContentSchema, noteSchema } from "./note-schema";

// A minimal valid note, one of each element type. Tests clone and mutate it.
function validContent(): NoteContent {
  return {
    version: 1,
    w: 500,
    h: 500,
    colour: "yellow",
    rotation: -2,
    curl: { bl: 0.3, br: 0.1 },
    fastener: "pin-red",
    elements: [
      { type: "stroke", ink: "red", size: 8, points: [[10, 20, 0.5]] },
      {
        type: "text",
        x: 40,
        y: 60,
        w: 180,
        text: "hi",
        font: "casual",
        color: "black",
        fontSize: 24,
        rotation: 0,
      },
      { type: "sticker", x: 120, y: 90, emoji: "⭐", scale: 1, rotation: 0 },
    ],
  };
}

// biome-ignore lint/suspicious/noExplicitAny: tests deliberately build invalid shapes.
const bad = (content: any) => noteContentSchema.safeParse(content).success;

const BELL = String.fromCharCode(7); // a control char to smuggle in
const CR = String.fromCharCode(13);

describe("noteSchema", () => {
  it("accepts a valid submission and trims the author", () => {
    const result = noteSchema.safeParse({
      author: "  Ada  ",
      content: validContent(),
    });
    expect(result.success).toBe(true);
    expect(result.data?.author).toBe("Ada");
  });

  it("accepts a note with no elements", () => {
    expect(bad({ ...validContent(), elements: [] })).toBe(true);
  });

  it.each([
    ["empty after trim", "   "],
    ["over 50 chars", "a".repeat(51)],
    ["contains a newline", "Ada\nCheatley"],
    ["contains a control char", `Ada${BELL}`],
  ])("rejects an author that is %s", (_label, author) => {
    expect(
      noteSchema.safeParse({ author, content: validContent() }).success,
    ).toBe(false);
  });
});

describe("noteContentSchema", () => {
  it("accepts the canonical valid note", () => {
    expect(bad(validContent())).toBe(true);
  });

  it.each<[string, (c: NoteContent) => unknown]>([
    ["wrong version", (c) => ({ ...c, version: 2 })],
    ["non-500 width", (c) => ({ ...c, w: 400 })],
    ["non-500 height", (c) => ({ ...c, h: 501 })],
    ["unknown top-level key", (c) => ({ ...c, hacked: true })],
    ["bad paper colour", (c) => ({ ...c, colour: "cyan" })],
    ["curl corner above 1", (c) => ({ ...c, curl: { bl: 1.5, br: 0 } })],
    ["curl missing a corner", (c) => ({ ...c, curl: { bl: 0.5 } })],
    ["bad fastener", (c) => ({ ...c, fastener: "glue" })],
    ["note rotation out of range", (c) => ({ ...c, rotation: 200 })],
    [
      "more than 80 elements",
      (c) => ({
        ...c,
        elements: Array.from({ length: 81 }, () => ({
          type: "sticker",
          x: 0,
          y: 0,
          emoji: "⭐",
          scale: 1,
          rotation: 0,
        })),
      }),
    ],
    [
      "unknown element type",
      (c) => ({ ...c, elements: [{ type: "photo", x: 0, y: 0 }] }),
    ],
    [
      "bad ink on a stroke",
      (c) => ({
        ...c,
        elements: [
          { type: "stroke", ink: "purple", size: 8, points: [[0, 0, 0.5]] },
        ],
      }),
    ],
    [
      "stroke size out of range",
      (c) => ({
        ...c,
        elements: [
          { type: "stroke", ink: "red", size: 99, points: [[0, 0, 0.5]] },
        ],
      }),
    ],
    [
      "empty stroke",
      (c) => ({
        ...c,
        elements: [{ type: "stroke", ink: "red", size: 8, points: [] }],
      }),
    ],
    [
      "more than 1000 points in a stroke",
      (c) => ({
        ...c,
        elements: [
          {
            type: "stroke",
            ink: "red",
            size: 8,
            points: Array.from({ length: 1001 }, () => [10, 10, 0.5]),
          },
        ],
      }),
    ],
    [
      "coordinate out of range",
      (c) => ({
        ...c,
        elements: [
          { type: "stroke", ink: "red", size: 8, points: [[600, 0, 0.5]] },
        ],
      }),
    ],
    [
      "bad font on a text box",
      (c) => ({
        ...c,
        elements: [
          {
            type: "text",
            x: 0,
            y: 0,
            w: 100,
            text: "hi",
            font: "comic",
            color: "black",
            fontSize: 24,
            rotation: 0,
          },
        ],
      }),
    ],
    [
      "fontSize out of range",
      (c) => ({
        ...c,
        elements: [
          {
            type: "text",
            x: 0,
            y: 0,
            w: 100,
            text: "hi",
            font: "casual",
            color: "black",
            fontSize: 200,
            rotation: 0,
          },
        ],
      }),
    ],
    [
      "sticker emoji not on the allowlist",
      (c) => ({
        ...c,
        elements: [
          { type: "sticker", x: 0, y: 0, emoji: "🍆", scale: 1, rotation: 0 },
        ],
      }),
    ],
    [
      "sticker scale out of range",
      (c) => ({
        ...c,
        elements: [
          { type: "sticker", x: 0, y: 0, emoji: "⭐", scale: 10, rotation: 0 },
        ],
      }),
    ],
  ])("rejects %s", (_label, mutate) => {
    expect(bad(mutate(validContent()))).toBe(false);
  });

  it("rejects a text box longer than 280 chars after stripping", () => {
    const c = validContent();
    c.elements = [
      {
        type: "text",
        x: 0,
        y: 0,
        w: 100,
        text: "a".repeat(281),
        font: "casual",
        color: "black",
        fontSize: 24,
        rotation: 0,
      },
    ];
    expect(bad(c)).toBe(false);
  });

  it("keeps newlines in text but strips other control chars", () => {
    const c = validContent();
    c.elements = [
      {
        type: "text",
        x: 0,
        y: 0,
        w: 100,
        text: `line1\nline2${BELL}${CR}`,
        font: "casual",
        color: "black",
        fontSize: 24,
        rotation: 0,
      },
    ];
    const parsed = noteContentSchema.safeParse(c);
    expect(parsed.success).toBe(true);
    const text = parsed.data?.elements[0];
    expect(text?.type === "text" && text.text).toBe("line1\nline2");
  });

  it("rejects an oversized body even when point counts are legal", () => {
    // 20 strokes × 1000 points = 20 000 (the point-total cap, allowed) but the
    // serialised JSON blows past 256 KB, so the byte cap must reject it.
    const c = validContent();
    c.elements = Array.from({ length: 20 }, () => ({
      type: "stroke" as const,
      ink: "black" as const,
      size: 8,
      points: Array.from(
        { length: 1000 },
        () => [100, 100, 0.5] as [number, number, number],
      ),
    }));
    expect(bad(c)).toBe(false);
  });
});
