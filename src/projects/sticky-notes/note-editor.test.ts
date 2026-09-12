import { describe, expect, it } from "vitest";
import {
  addElement,
  bounds,
  clampCoord,
  cycleHit,
  type Element,
  emptyNote,
  hitTest,
  hitTestAll,
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

const sticker = (x: number, y: number, scale = 1): Element => ({
  type: "sticker",
  x,
  y,
  emoji: "⭐",
  scale,
  rotation: 0,
});

const text = (over?: Partial<Extract<Element, { type: "text" }>>): Element => ({
  type: "text",
  x: 100,
  y: 100,
  w: 200,
  text: "hello",
  font: "casual",
  color: "black",
  fontSize: 20,
  rotation: 0,
  ...over,
});

// A ring of ink: r = 100 about (250, 250). Its bounding box swallows the whole
// middle of the note, which is exactly what the old box hit-test got wrong.
const circleStroke = (): Element =>
  stroke({
    size: 8,
    points: Array.from({ length: 33 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return [250 + 100 * Math.cos(a), 250 + 100 * Math.sin(a), 0.5] as [
        number,
        number,
        number,
      ];
    }),
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

  it("moveElement translates and clamps the element's box into range", () => {
    const note = addElement(emptyNote(seq(0.1)), sticker(10, 10));
    const moved = moveElement(note, 0, 5, -30);
    const el = moved.elements[0];
    expect(el).toMatchObject({ x: 15, y: -20 });
    // clamp is on the box, not the coord: the sticker's top edge (y - 24)
    // stops at -50, so its centre stops at -26.
    const off = moveElement(note, 0, 0, -999);
    expect((off.elements[0] as { y: number }).y).toBe(-26);
  });

  it("moveElement is rigid: a stroke dragged past the edge keeps its shape", () => {
    const note = addElement(
      emptyNote(seq(0.1)),
      stroke({
        size: 8,
        points: [
          [10, 10, 0.5],
          [60, 10, 0.5],
        ],
      }),
    );
    // bounds x0 = 10 - 4 = 6, so the biggest leftward delta is -56
    const moved = moveElement(note, 0, -999, 0);
    const pts = (moved.elements[0] as { points: [number, number, number][] })
      .points;
    expect(pts[0]?.[0]).toBe(-46);
    expect(pts[1]?.[0]).toBe(4);
    // the 50-unit gap survives: no per-point collapse onto the boundary
    expect((pts[1]?.[0] ?? 0) - (pts[0]?.[0] ?? 0)).toBe(50);
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

  it("text bounds start at the text's y, not a line above it", () => {
    const b = bounds(text());
    expect(b.y0).toBe(100);
    expect(b.y1).toBe(120); // one line: y + fontSize
    expect(b.x0).toBe(100);
    expect(b.x1).toBe(300); // x + w
  });

  it("text bounds grow by 1.2 line-height per wrapped line", () => {
    const b = bounds(text({ text: "one\ntwo\nthree" }));
    // y + fontSize + 2 x 1.2 x fontSize
    expect(b.y1).toBe(168);
  });
});

describe("hit-testing", () => {
  it("a point inside a drawn circle misses the stroke and hits the sticker under it", () => {
    let note = emptyNote(seq(0.1));
    note = addElement(note, sticker(250, 250, 2)); // index 0, below
    note = addElement(note, circleStroke()); // index 1, on top
    // dead centre: 100 units from the ink, well past size/2 + slop
    expect(hitTestAll(note, 250, 250)).toEqual([0]);
    // on the ink itself the stroke wins, sticker is out of its box
    expect(hitTestAll(note, 350, 250)).toEqual([1]);
  });

  it("hit-tests text through its own rotation", () => {
    let note = emptyNote(seq(0.1));
    note = addElement(note, text({ rotation: 90 }));
    // (200, 110) is inside the unrotated box; rotating the box 90 deg about
    // (100, 100) carries that spot to (90, 200).
    expect(hitTest(note, 90, 200)).toBe(0);
    expect(hitTest(note, 200, 110)).toBe(-1);
  });

  it("hitTestAll lists every hit topmost-first", () => {
    let note = emptyNote(seq(0.1));
    note = addElement(note, sticker(100, 100));
    note = addElement(note, sticker(400, 400));
    note = addElement(note, sticker(100, 100));
    expect(hitTestAll(note, 100, 100)).toEqual([2, 0]);
    expect(hitTestAll(note, 10, 400)).toEqual([]);
  });
});

describe("cycleHit", () => {
  it("steps to the next hit and wraps", () => {
    expect(cycleHit([2, 0], 2)).toBe(0);
    expect(cycleHit([2, 0], 0)).toBe(2);
  });

  it("starts at the topmost hit when nothing relevant is selected", () => {
    expect(cycleHit([2, 0], 5)).toBe(2);
    expect(cycleHit([2, 0], -1)).toBe(2);
  });

  it("is -1 when nothing was hit", () => {
    expect(cycleHit([], 1)).toBe(-1);
  });
});
