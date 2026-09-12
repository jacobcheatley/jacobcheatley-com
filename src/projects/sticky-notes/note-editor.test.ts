import { describe, expect, it } from "vitest";
import {
  addElement,
  bounds,
  clampCoord,
  type Element,
  emptyNote,
  hitTest,
  isOffNote,
  moveElement,
  removeElement,
} from "./note-editor";
import { MAX_ELEMENTS, noteContentSchema, noteSchema } from "./note-schema";

// A seeded RNG so seeded cosmetics are deterministic in tests.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length] ?? 0;
};

const stroke = (
  over?: Partial<Extract<Element, { type: "stroke" }>>,
): Element => ({
  type: "stroke",
  ink: "black",
  size: 8,
  points: [
    [10, 10, 0.5],
    [20, 20, 0.6],
  ],
  ...over,
});

const sticker = (x: number, y: number): Element => ({
  type: "sticker",
  x,
  y,
  emoji: "⭐",
  scale: 1,
  rotation: 0,
});

describe("emptyNote", () => {
  it("seeds a blank note that passes the write-path contract", () => {
    const note = emptyNote(seq(0.5, 0.5, 0.1, 0.2));
    expect(() => noteContentSchema.parse(note)).not.toThrow();
    expect(note.elements).toHaveLength(0);
    expect(note.fastener).toBe("none"); // fastener chosen at submit, not seeded
  });

  it("a fully built note + author passes the full submission contract", () => {
    let note = emptyNote(seq(0.2));
    note = addElement(note, stroke());
    note = addElement(note, {
      type: "text",
      x: 40,
      y: 60,
      w: 180,
      text: "hi there",
      font: "casual",
      color: "green",
      fontSize: 24,
      rotation: 0,
    });
    note = addElement(note, sticker(120, 90));
    note = { ...note, fastener: "pin-red" };
    expect(() =>
      noteSchema.parse({ author: "ada", content: note }),
    ).not.toThrow();
  });
});

describe("element ops", () => {
  it("addElement appends (z-order) but refuses past the element cap", () => {
    let note = emptyNote(seq(0.1));
    for (let i = 0; i < MAX_ELEMENTS + 5; i++)
      note = addElement(note, sticker(10, 10));
    expect(note.elements).toHaveLength(MAX_ELEMENTS);
  });

  it("moveElement translates and clamps into the coord range", () => {
    const note = addElement(emptyNote(seq(0.1)), sticker(10, 10));
    const moved = moveElement(note, 0, 5, -30);
    const el = moved.elements[0];
    expect(el).toMatchObject({ x: 15, y: -20 });
    // clamp: dragging far past the top edge stops at -50
    const off = moveElement(note, 0, 0, -999);
    expect((off.elements[0] as { y: number }).y).toBe(-50);
  });

  it("removeElement drops the given index", () => {
    let note = emptyNote(seq(0.1));
    note = addElement(note, sticker(10, 10));
    note = addElement(note, sticker(20, 20));
    const after = removeElement(note, 0);
    expect(after.elements).toHaveLength(1);
    expect((after.elements[0] as { x: number }).x).toBe(20);
  });
});

describe("geometry", () => {
  it("clampCoord holds within the schema's -50..550 slack", () => {
    expect(clampCoord(-100)).toBe(-50);
    expect(clampCoord(999)).toBe(550);
    expect(clampCoord(200)).toBe(200);
  });

  it("isOffNote is true only when fully outside the paper", () => {
    expect(isOffNote(sticker(250, 250))).toBe(false);
    expect(isOffNote(sticker(-40, 250))).toBe(true); // sticker r=24, x1=-16 < 0
    expect(isOffNote(sticker(250, 600))).toBe(true);
  });

  it("hitTest returns the topmost element under a point, or -1", () => {
    let note = emptyNote(seq(0.1));
    note = addElement(note, sticker(100, 100)); // index 0, below
    note = addElement(note, sticker(100, 100)); // index 1, on top
    expect(hitTest(note, 100, 100)).toBe(1);
    expect(hitTest(note, 400, 400)).toBe(-1);
  });

  it("bounds pads a stroke by half its size", () => {
    const b = bounds(stroke({ size: 20 }));
    expect(b.x0).toBe(0); // min x 10 - 10
    expect(b.x1).toBe(30); // max x 20 + 10
  });
});
