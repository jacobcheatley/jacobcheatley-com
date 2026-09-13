import { describe, expect, it } from "vitest";
import {
  addElement,
  bounds,
  clampCoord,
  clientToNoteCoords,
  curlCorner,
  curlFromPointer,
  cycleHit,
  type Element,
  elementHandles,
  emptyNote,
  handleTransform,
  hitTest,
  hitTestAll,
  isEdgeBand,
  isOffNote,
  MIN_TEXT_W,
  moveElement,
  noteSide,
  removeElement,
  scaleElement,
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

  it("moveElement translates without clamping", () => {
    const note = addElement(emptyNote(seq(0.1)), sticker(10, 10));
    expect(moveElement(note, 0, 5, -30).elements[0]).toMatchObject({
      x: 15,
      y: -20,
    });
    // mid-drag an element may leave the stored range entirely: that's what
    // makes drag-off-to-delete reachable. settleElement puts it back.
    expect(moveElement(note, 0, 0, -999).elements[0]).toMatchObject({
      y: -989,
    });
  });

  it("moveElement is rigid: a stroke dragged past the edge keeps its shape", () => {
    const note = addElement(
      emptyNote(seq(0.1)),
      stroke({
        size: 8,
        points: [
          [10, 10, 0.5],
          [50, 10, 0.5],
        ],
      }),
    );
    const pts = (
      moveElement(note, 0, -130, 0).elements[0] as {
        points: [number, number, number][];
      }
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
      addElement(
        emptyNote(seq(0.1)),
        stroke({
          points: [
            [10, 40, 0.5],
            [50, 40, 0.5],
          ],
        }),
      ),
      0,
      -130,
      0,
    ).elements[0] as Element;
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

  it("a sticker dragged fully off the paper is deletable, not settled onto it", () => {
    // the drag-off-to-delete path: the shell sees isOffNote first and removes
    // the element, so it never reaches settleElement
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
  it("finds the rotate band along every edge and nowhere in the middle", () => {
    expect(isEdgeBand(250, 5)).toBe(true);
    expect(isEdgeBand(5, 250)).toBe(true);
    expect(isEdgeBand(495, 250)).toBe(true);
    expect(isEdgeBand(250, 495)).toBe(true);
    expect(isEdgeBand(250, 250)).toBe(false);
    expect(isEdgeBand(250, 30)).toBe(false);
    // off the paper entirely is not the paper's edge
    expect(isEdgeBand(-10, 250)).toBe(false);
  });

  it("takes hold of the corner a pointer came down on", () => {
    const flat = { bl: 0, br: 0 };
    expect(curlCorner(flat, 20, 480)).toBe("bl");
    expect(curlCorner(flat, 480, 480)).toBe("br");
    expect(curlCorner(flat, 250, 250)).toBeNull();
    // a flat corner is still grabbable; a peeled one is grabbable further in
    expect(curlCorner(flat, 50, 450)).toBeNull();
    expect(curlCorner({ bl: 1, br: 0 }, 50, 450)).toBe("bl");
  });

  it("peels a corner by how far it is pulled along its diagonal", () => {
    expect(curlFromPointer("bl", 0, 500)).toBe(0); // the corner itself
    expect(curlFromPointer("bl", 85, 415)).toBeCloseTo(1, 1);
    expect(curlFromPointer("br", 415, 415)).toBeCloseTo(1, 1);
    // half way in, and never past a whole fold or back past flat
    expect(curlFromPointer("br", 458, 458)).toBeCloseTo(0.5, 1);
    expect(curlFromPointer("br", 0, 0)).toBe(1);
    expect(curlFromPointer("br", 600, 600)).toBe(0);
  });

  it("peels each corner along its own diagonal, not the other's", () => {
    // mirrored across the sheet: the same pull, the same curl
    expect(curlFromPointer("bl", 60, 440)).toBeCloseTo(
      curlFromPointer("br", 440, 440),
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

  it("reads scale off the reach and rotation off the swing", () => {
    const anchor: [number, number] = [100, 100];
    // straight out from the anchor, twice as far: twice the size, same angle
    expect(handleTransform(anchor, [150, 100], [200, 100], 1, 0)).toEqual({
      scale: 2,
      rotation: 0,
    });
    // a quarter turn round it, same distance: same size, turned 90
    const t = handleTransform(anchor, [150, 100], [100, 150], 2, 10);
    expect(t.scale).toBeCloseTo(2);
    expect(t.rotation).toBeCloseTo(100);
  });

  it("keeps a turn inside the contract's half circle either way", () => {
    expect(
      handleTransform([0, 0], [10, 0], [0, 10], 1, 170).rotation,
    ).toBeCloseTo(-100); // 170 + 90 comes back round, it does not reach 260
  });

  it("holds still for a handle grabbed on the anchor itself", () => {
    expect(handleTransform([100, 100], [100, 100], [300, 300], 3, 45)).toEqual({
      scale: 3,
      rotation: 45,
    });
  });

  it("holds a scaled element inside the contract's ranges", () => {
    const big = scaleElement(sticker(250, 250), 99, 30);
    expect(big).toMatchObject({ scale: 4, rotation: 30 });
    expect(scaleElement(sticker(250, 250), 0.01, 0)).toMatchObject({
      scale: 0.25,
    });
    expect(scaleElement(text(), 200, 0)).toMatchObject({ fontSize: 96 });
    expect(scaleElement(text(), 1, 0)).toMatchObject({ fontSize: 8 });
    // a stroke has no handle, so nothing to scale
    expect(scaleElement(stroke(), 4, 90)).toEqual(stroke());
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

  it("never lets a box get narrower than a word or wider than the contract", () => {
    expect(widthFromPointer({ x: 100, y: 100, rotation: 0 }, 0, 100)).toBe(40);
    expect(widthFromPointer({ x: 100, y: 100, rotation: 0 }, 9000, 100)).toBe(
      600,
    );
  });
});
