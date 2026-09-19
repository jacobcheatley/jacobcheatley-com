import { describe, expect, it } from "vitest";
import {
  addElement,
  angleOf,
  bounds,
  clampCoord,
  clientToNoteCoords,
  curlCorner,
  curlFromPointer,
  type Element,
  elementHandles,
  emptyNote,
  fixedElement,
  grabbedHandle,
  grabPlacing,
  hitTest,
  hitTestAll,
  isOffNote,
  MIN_TEXT_W,
  moveElement,
  noteSide,
  outsideSpinDead,
  removeElement,
  rotationFromHandle,
  SPIN_DEAD,
  settleElement,
  turnNote,
  widthFromPointer,
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
// middle of the note, which a box hit-test would wrongly count as a hit.
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

  it("moveElement translates without clamping", () => {
    expect(moveElement(sticker(10, 10), 5, -30)).toMatchObject({
      type: "sticker",
      x: 15,
      y: -20,
    });
    // mid-drag an element may leave the stored range entirely; settleElement
    // puts it back.
    expect(moveElement(sticker(10, 10), 0, -999)).toMatchObject({ y: -989 });
  });

  it("moveElement leaves a drag's float dust out of the note", () => {
    expect(moveElement(sticker(60, 80), 150.1 - 100.3, 0)).toMatchObject({
      x: 109.8,
    });
  });

  it("moveElement is rigid: a stroke dragged past the edge keeps its shape", () => {
    const pts = (
      moveElement(
        stroke({
          size: 8,
          points: [
            [10, 10, 0.5],
            [50, 10, 0.5],
          ],
        }),
        -130,
        0,
      ) as { points: [number, number, number][] }
    ).points;
    expect(pts[0]?.[0]).toBe(-120);
    expect(pts[1]?.[0]).toBe(-80);
    // the 40-unit gap survives: no per-point collapse onto the boundary
    expect((pts[1]?.[0] ?? 0) - (pts[0]?.[0] ?? 0)).toBe(40);
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

describe("settleElement", () => {
  it("leaves an in-range element alone, object identity included", () => {
    const el = sticker(250, 250);
    expect(settleElement(el)).toBe(el);
  });

  it("shifts a stroke by the minimum that puts every point back in range", () => {
    const dragged = moveElement(
      stroke({
        points: [
          [10, 40, 0.5],
          [50, 40, 0.5],
        ],
      }),
      -130,
      0,
    );
    const pts = (
      settleElement(dragged) as { points: [number, number, number][] }
    ).points;
    // min x -120 back to -50: every point moves by the same +70, y untouched
    expect(pts.map((p) => p[0])).toEqual([-50, -10]);
    expect(pts.map((p) => p[1])).toEqual([40, 40]);
  });

  it("settles a sticker's anchor, not its silhouette", () => {
    expect(settleElement(sticker(-90, 250))).toMatchObject({
      x: -50,
      y: 250,
    });
  });

  it("settles a text anchor dragged past the right edge", () => {
    const el = text({ x: 560, y: 100 });
    expect(isOffNote(el)).toBe(true);
    expect(settleElement(el)).toMatchObject({ x: 550, y: 100 });
  });

  it("a sticker dragged fully off the paper is off the note, not settled onto it", () => {
    // off the paper is isOffNote's call: settleElement would only bring its
    // anchor back inside the stored range
    expect(isOffNote(sticker(-100, 250))).toBe(true);
  });
});

describe("geometry", () => {
  it("clampCoord holds within the schema's -50..550 slack", () => {
    expect(clampCoord(-100)).toBe(-50);
    expect(clampCoord(999)).toBe(550);
    expect(clampCoord(200)).toBe(200);
    // and rounds off the tilt's float dust, so the stored note stays tidy
    expect(clampCoord(250.00000000000003)).toBe(250);
    expect(clampCoord(123.456)).toBe(123.5);
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

describe("clientToNoteCoords", () => {
  // a 500px sheet centred at (300, 300) on screen: one client px = one unit
  const centre: [number, number] = [300, 300];
  const map = (
    client: [number, number],
    deg: number,
    side = 500,
  ): [number, number] => clientToNoteCoords(client, centre, side, deg);
  const near = ([x, y]: [number, number], ex: number, ey: number) => {
    expect(x).toBeCloseTo(ex);
    expect(y).toBeCloseTo(ey);
  };

  it("is the plain box mapping on an untilted note", () => {
    near(map([300, 300], 0), 250, 250); // the centre is the centre
    near(map([50, 50], 0), 0, 0); // top-left corner
    near(map([550, 550], 0), 500, 500);
  });

  it("carries the pointer back through the note's rotation", () => {
    // turned a quarter turn, the note's top edge faces right: a pointer on the
    // right of the screen is writing at the top of the paper.
    near(map([550, 300], 90), 250, 0);
    near(map([300, 550], 90), 500, 250);
  });

  it("round-trips a point back to where it was pressed", () => {
    for (const deg of [-25, -4, 0, 7.5, 90]) {
      const [x, y] = map([420, 180], deg);
      const a = (deg * Math.PI) / 180;
      const dx = x - 250;
      const dy = y - 250;
      // the same rotation forwards again, at one unit per px
      expect(300 + dx * Math.cos(a) - dy * Math.sin(a)).toBeCloseTo(420);
      expect(300 + dx * Math.sin(a) + dy * Math.cos(a)).toBeCloseTo(180);
    }
  });

  it("scales a note rendered at any size", () => {
    near(map([425, 300], 0, 250), 500, 250); // half size: 125px = 250 units
  });
});

describe("noteSide", () => {
  it("is the box itself when the note is square to the screen", () => {
    expect(noteSide(360, 0)).toBeCloseTo(360);
    expect(noteSide(360, 90)).toBeCloseTo(360);
  });

  it("shrinks out the corners a tilted note pokes into its box", () => {
    expect(noteSide(360, 45)).toBeCloseTo(360 / Math.SQRT2);
    expect(noteSide(360, -45)).toBeCloseTo(360 / Math.SQRT2);
  });
});

describe("the paper's own handles", () => {
  it("takes hold of the corner a pointer came down on", () => {
    const flat = { bl: 0, br: 0 };
    expect(curlCorner(flat, 20, 480)).toBe("bl");
    expect(curlCorner(flat, 480, 480)).toBe("br");
    expect(curlCorner(flat, 250, 250)).toBeNull();
    // a flat corner is still grabbable; a peeled one is grabbable further in
    expect(curlCorner(flat, 50, 450)).toBeNull();
    expect(curlCorner({ bl: 1, br: 0 }, 50, 450)).toBe("bl");
  });

  it("takes hold of a peeled corner by the flap drawn over the sheet", () => {
    // a whole fold's flap is the triangle (380,500) (500,380) (380,380): its
    // tip is far past the cut-away corner, but it is what the visitor sees
    const peeled = { bl: 0, br: 1 };
    expect(curlCorner(peeled, 390, 390)).toBe("br");
    expect(curlCorner(peeled, 370, 450)).toBeNull(); // past the flap's edge
  });

  it("peels a corner by how far it is pulled along its diagonal since it was taken", () => {
    const corner: [number, number] = [500, 500];
    // pulled in from the corner by a whole fold's diagonal, and half of one
    expect(curlFromPointer("br", 0, corner, [415, 415])).toBeCloseTo(1, 1);
    expect(curlFromPointer("br", 0, corner, [458, 458])).toBeCloseTo(0.5, 1);
    // never past a whole fold or back past flat
    expect(curlFromPointer("br", 0.9, [480, 480], [0, 0])).toBe(1);
    expect(curlFromPointer("br", 0.1, [400, 400], [600, 600])).toBe(0);
    // and a curl the stored JSON can afford: two places
    expect(curlFromPointer("bl", 0, [0, 500], [10, 490])).toBe(0.12);
  });

  it("keeps the fold a corner had when it is taken hold of", () => {
    // grabbed near the corner itself: an absolute reading would lay it flat
    expect(curlFromPointer("br", 1, [496, 496], [496, 496])).toBe(1);
    // grabbed on the flap: an absolute reading would jump it
    expect(curlFromPointer("br", 0.4, [390, 390], [390, 390])).toBe(0.4);
  });

  it("peels each corner along its own diagonal, not the other's", () => {
    // mirrored across the sheet: the same pull, the same curl
    expect(curlFromPointer("bl", 0, [0, 500], [60, 440])).toBeCloseTo(
      curlFromPointer("br", 0, [500, 500], [440, 440]),
    );
  });
});

describe("turnNote", () => {
  it("adds the swept angle to where the note started", () => {
    expect(turnNote(0, 12)).toBe(12);
    expect(turnNote(-4, -6.24)).toBe(-10.2); // a tenth of a degree is plenty
  });

  it("holds the note to a tilt the wall can wear", () => {
    expect(turnNote(0, 90)).toBe(25);
    expect(turnNote(0, -90)).toBe(-25);
  });

  it("reads a sweep across the centre as the short way round", () => {
    // atan2 flips a whole turn there: 350 degrees clockwise is 10 back
    expect(turnNote(0, 350)).toBe(-10);
    expect(turnNote(0, -350)).toBe(10);
  });
});

describe("outsideSpinDead", () => {
  it("is false near the centre, where an angle would jump", () => {
    expect(outsideSpinDead(250, 250)).toBe(false);
    expect(outsideSpinDead(250 + SPIN_DEAD, 250)).toBe(false); // on the rim
    expect(outsideSpinDead(250, 250 - SPIN_DEAD + 1)).toBe(false);
  });

  it("is true anywhere past the rim", () => {
    expect(outsideSpinDead(250 + SPIN_DEAD + 1, 250)).toBe(true);
    expect(outsideSpinDead(0, 0)).toBe(true);
  });
});

describe("rotationFromHandle", () => {
  const at = (x: number, y: number, rotation: number) => ({ x, y, rotation });

  it("turns an unturned element by the angle swept round its anchor, whatever the reach", () => {
    // a quarter turn round (100, 100), at any distance: no size in it
    expect(rotationFromHandle(at(100, 100, 0), [150, 100], [100, 300])).toBe(
      90,
    );
  });

  it("adds the swing to a turned element, inside the contract's half circle", () => {
    expect(rotationFromHandle(at(0, 0, 10), [10, 0], [0, 10])).toBe(100);
    // 170 + 90 comes back round, it does not reach 260
    expect(rotationFromHandle(at(0, 0, 170), [10, 0], [0, 10])).toBe(-100);
  });

  it("holds still for a handle grabbed on the anchor itself", () => {
    expect(rotationFromHandle(at(100, 100, 45), [100, 100], [300, 300])).toBe(
      45,
    );
  });
});

describe("an element's own handles", () => {
  it("hangs the handles off the corner and the right edge of the box", () => {
    // a sticker is 48 wide at scale 1, so its box corner is 24 in from centre
    expect(elementHandles(sticker(250, 250))?.corner).toEqual([274, 274]);
    expect(elementHandles(sticker(250, 250))?.width).toBeNull();

    // one line of 20pt text, 200 wide: the box is 100..300 x 100..120
    const h = elementHandles(text());
    expect(h?.corner).toEqual([300, 120]);
    expect(h?.width).toEqual([300, 110]);
  });

  it("turns the handles with the element they belong to", () => {
    const [x = 0, y = 0] = elementHandles(sticker(250, 250, 1))?.corner ?? [];
    const turned = elementHandles({
      // `Extract` picks the sticker member of the union, so the spread is known
      // to carry a sticker's fields
      ...(sticker(250, 250) as Extract<Element, { type: "sticker" }>),
      rotation: 90,
    })?.corner;
    // a quarter turn about (250, 250) carries the bottom-right corner to the
    // bottom-left, and never leaves the box behind
    expect(turned?.[0]).toBeCloseTo(250 - (y - 250));
    expect(turned?.[1]).toBeCloseTo(250 + (x - 250));
  });

  it("has no handles on a stroke", () => {
    expect(elementHandles(stroke())).toBeNull();
  });

  it("takes the nearest handle within reach, not the first one listed", () => {
    // one line of 20pt text: the width handle is only 10 above the corner
    const h = elementHandles(text());
    if (!h) throw new Error("text has handles");
    expect(grabbedHandle(h, 300, 120, 24)).toBe("corner");
    expect(grabbedHandle(h, 300, 110, 24)).toBe("width");
    expect(grabbedHandle(h, 250, 250, 24)).toBeNull();
    // a sticker has no width handle to lose to
    const s = elementHandles(sticker(250, 250));
    if (!s) throw new Error("stickers have handles");
    expect(grabbedHandle(s, 270, 270, 24)).toBe("corner");
  });

  it("reads the angle from one point out to another, in degrees", () => {
    expect(angleOf([0, 0], [10, 0])).toBe(0);
    expect(angleOf([0, 0], [0, 10])).toBe(90); // y runs down the screen
    expect(angleOf([10, 10], [0, 10])).toBe(180);
  });

  it("widens a text box along its own axis", () => {
    expect(widthFromPointer({ x: 100, y: 100, rotation: 0 }, 340, 100)).toBe(
      240,
    );
    // turned a quarter turn, its width runs down the screen
    expect(widthFromPointer({ x: 100, y: 100, rotation: 90 }, 100, 340)).toBe(
      240,
    );
    // and across the screen is no width at all
    expect(widthFromPointer({ x: 100, y: 100, rotation: 90 }, 340, 100)).toBe(
      MIN_TEXT_W,
    );
  });

  it("moves a sticker pressed in its middle, though its corner is within a thumb's reach", () => {
    // a phone draws the note at ~0.5px a unit, so a 24px reach is ~49 units:
    // more than the 34 from a sticker's middle to its corner
    const s = sticker(250, 250);
    expect(grabPlacing(s, 250, 250, 49)).toBe("move");
    expect(grabPlacing(s, 274, 274, 49)).toBe("corner"); // on the handle
    expect(grabPlacing(s, 266, 266, 49)).toBe("corner"); // close by, inside
    expect(grabPlacing(s, 300, 300, 49)).toBe("corner"); // a thumb away, outside
    expect(grabPlacing(s, 330, 330, 49)).toBeNull();
  });

  it("takes a text box by its width handle, its body, or not at all", () => {
    // one line of 20pt text: 100..300 x 100..120, width handle at (300, 110)
    expect(grabPlacing(text(), 318, 110, 24)).toBe("width");
    expect(grabPlacing(text(), 150, 110, 24)).toBe("move");
    expect(grabPlacing(text(), 400, 400, 24)).toBeNull();
  });

  it("fixes a sticker as it lies", () => {
    const s = sticker(250, 250);
    expect(fixedElement(s)).toBe(s);
  });

  it("fixes a text box trimmed, and an empty one as nothing", () => {
    expect(fixedElement(text({ text: "  hi \n" }))).toEqual(
      text({ text: "hi" }),
    );
    expect(fixedElement(text({ text: " \n " }))).toBeNull();
  });

  it("never lets a box get narrower than a word or wider than the contract", () => {
    expect(widthFromPointer({ x: 100, y: 100, rotation: 0 }, 0, 100)).toBe(40);
    expect(widthFromPointer({ x: 100, y: 100, rotation: 0 }, 9000, 100)).toBe(
      600,
    );
  });
});
