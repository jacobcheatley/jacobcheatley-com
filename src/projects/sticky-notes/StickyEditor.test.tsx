import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Element, emptyNote } from "./note-editor";
import { MAX_ELEMENTS, type NoteContent, STICKER_EMOJI } from "./note-schema";
import StickyEditor from "./StickyEditor";

// The desk island (#73). No tools yet — markers, eraser and stickers land in
// T4/T5 — so on this mat a note can only be born at the pad stack and only die
// in the bin. Motion is CSS; these tests assert the state a transition carries,
// never the transition itself.

// Both the fan and the crumple only take effect once their timer has run, so
// the whole file runs on fake timers and steps past them explicitly.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const FAN_SETTLED = 300; // > FAN_MS
const CRUMPLED = 600; // > CRUMPLE_MS
const GHOST_MS = 400; // > the rubbed-out fade
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

const stack = () => screen.getByRole("button", { name: /fan out the pads/i });
// a pad is the only button whose label ends in that colour's paper/sheet —
// the markers name colours too ("Pick up the blue marker")
const pad = (colour: string) =>
  screen.getByRole("button", {
    name: new RegExp(`${colour} (paper|sheet)`, "i"),
  });
const bin = () => screen.getByRole("button", { name: /bin this note/i });
// the fixed boxes the strip's objects lie in, by the marker on each
const slot = (name: string) =>
  document.querySelector<HTMLElement>(`[data-slot="${name}"]`);
// The eraser and the sticker tab ARE their own boxes — no wrapper sets a
// second one — so they are found the way a visitor finds them.
const eraserSlot = () => screen.getByRole("button", { name: /the eraser/i });
const tabSlot = () =>
  screen.getByRole("button", { name: /the sticker sheet/i });
const ERASER_BODY = '[data-object="eraser"]';
const note = () => screen.queryByRole("img", { name: /sticky note/i });
const paper = () =>
  note()?.closest("[data-colour]")?.getAttribute("data-colour");

const fanOut = () => {
  fireEvent.click(stack());
  wait(FAN_SETTLED);
};

const HI: Element = {
  type: "text",
  x: 40,
  y: 60,
  w: 240,
  text: "hi",
  font: "casual",
  color: "black",
  fontSize: 30,
  rotation: 0,
};

const seeded = (over: Partial<NoteContent>): NoteContent => ({
  ...emptyNote(),
  ...over,
});

describe("StickyEditor", () => {
  it("starts bare: no note on the mat and no reachable pad", () => {
    render(<StickyEditor />);
    expect(note()).toBeNull();
    expect(pad("blue")).toBeDisabled();
    expect(bin()).toBeDisabled();
  });

  it("fans the stack on the first tap, without tearing a sheet off", () => {
    render(<StickyEditor />);
    fanOut();

    expect(pad("blue")).toBeEnabled();
    expect(note()).toBeNull();
    // the trigger stays put and says which way it points
    expect(stack()).toHaveAttribute("aria-expanded", "true");
  });

  it("moves focus onto the fan so the keyboard can pick a colour", () => {
    render(<StickyEditor />);
    fanOut();

    expect(pad("yellow")).toHaveFocus();
  });

  it("tears a sheet off a fanned pad and closes the stack", () => {
    render(<StickyEditor />);
    fanOut();
    fireEvent.click(pad("blue"));

    expect(paper()).toBe("blue");
    expect(pad("blue")).toBeDisabled();
  });

  it("ignores a pad tapped before the fan has settled", () => {
    render(<StickyEditor />);
    fireEvent.click(stack());
    fireEvent.click(pad("blue")); // the pads are still in flight
    expect(note()).toBeNull();

    wait(FAN_SETTLED);
    fireEvent.click(pad("blue"));
    expect(paper()).toBe("blue");
  });

  it("swaps the paper under the content when another pad is tapped", () => {
    render(
      <StickyEditor
        initialContent={seeded({ colour: "yellow", elements: [HI] })}
      />,
    );
    fanOut();
    fireEvent.click(pad("pink"));

    expect(paper()).toBe("pink");
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("rests the note's own colour on top of the pile", () => {
    render(<StickyEditor initialContent={seeded({ colour: "pink" })} />);

    expect(Number(pad("pink").style.zIndex)).toBeGreaterThan(
      Number(pad("white").style.zIndex),
    );
  });

  it("closes the fan on a tap anywhere else", () => {
    render(<StickyEditor />);
    fanOut();
    fireEvent.click(screen.getByRole("button", { name: /close the pads/i }));

    expect(pad("blue")).toBeDisabled();
    expect(note()).toBeNull();
  });

  it("closes the fan on Escape", () => {
    render(<StickyEditor />);
    fanOut();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(pad("blue")).toBeDisabled();
    expect(stack()).toHaveAttribute("aria-expanded", "false");
  });

  it("crumples the note into the bin and tears a fresh sheet of the same colour", () => {
    render(
      <StickyEditor
        initialContent={seeded({ colour: "pink", elements: [HI] })}
      />,
    );
    fireEvent.click(bin());
    wait(CRUMPLED);

    expect(paper()).toBe("pink");
    expect(screen.queryByText("hi")).toBeNull();
  });

  it("ignores a colour swap made while the note is crumpling", () => {
    render(
      <StickyEditor
        initialContent={seeded({ colour: "pink", elements: [HI] })}
      />,
    );
    fireEvent.click(bin());
    expect(bin()).toBeDisabled();

    fanOut(); // still mid-flight: the fan settles inside the crumple
    fireEvent.click(pad("blue"));
    wait(CRUMPLED);

    expect(paper()).toBe("pink");
    expect(screen.queryByText("hi")).toBeNull();
  });
});

describe("StickyEditor tools", () => {
  it("picks a marker up and puts it down again", () => {
    render(<StickyEditor initialContent={seeded({})} />);

    fireEvent.click(
      screen.getByRole("button", { name: /pick up the red marker/i }),
    );
    expect(
      screen.getByRole("button", { name: /put down the red marker/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /put down the red marker/i }),
    );
    expect(
      screen.getByRole("button", { name: /pick up the red marker/i }),
    ).toBeInTheDocument();
  });

  it("holds one tool at a time", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    fireEvent.click(
      screen.getByRole("button", { name: /pick up the red marker/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /pick up the eraser/i }),
    );

    expect(
      screen.getByRole("button", { name: /pick up the red marker/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /put down the eraser/i }),
    ).toBeInTheDocument();
  });

  it("tints the draw/write control with the held ink and disables it in hand mode", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const draw = () =>
      screen.getByRole("button", { name: /draw with the marker/i });
    expect(draw()).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: /pick up the green marker/i }),
    );
    expect(draw()).toBeEnabled();
    expect(draw().style.color).toBe("rgb(22, 163, 74)");
  });
});

// The paper is the pointer surface. jsdom gives every box a zero rect, so stub
// it to a 500x500 square: note coordinates then equal client coordinates.
const PAPER_RECT = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 500,
  bottom: 500,
  width: 500,
  height: 500,
  toJSON: () => ({}),
};
function paperSurface(): HTMLElement {
  const el = note()?.closest("[data-colour]") as HTMLElement;
  el.getBoundingClientRect = () => PAPER_RECT;
  return el;
}
// The drawn elements, in z-order: NotePaper clips them into one group.
const drawn = (root: ParentNode = document.body) =>
  Array.from(root.querySelector("g[clip-path]")?.children ?? []);
const selectionBox = () => document.querySelector("rect[stroke-dasharray]");
// the overlay a rubbed-out element keeps fading on
const ghostLayer = () =>
  [...document.querySelectorAll("svg")].find(
    (svg) => svg.querySelector("title")?.textContent === "rubbed out",
  );

const down = (el: HTMLElement, x: number, y: number) =>
  fireEvent.pointerDown(el, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pressure: 0.5,
  });
const move = (el: HTMLElement, x: number, y: number, pointerId = 1) =>
  fireEvent.pointerMove(el, {
    clientX: x,
    clientY: y,
    pointerId,
    pressure: 0.5,
  });
const up = (el: HTMLElement) => fireEvent.pointerUp(el, { pointerId: 1 });

const pickUp = (name: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

// two text boxes that overlap around (60, 80) — B (last) draws on top of A
const A: Element = { ...HI, x: 40, y: 60, text: "aaa" };
const B: Element = { ...HI, x: 50, y: 70, text: "bbb" };

describe("StickyEditor drawing", () => {
  it("draws a stroke in the held ink at the fixed nib", () => {
    // the same two points, stored as a size-8 green stroke: the drawn path must
    // come out identical
    const reference = render(
      <StickyEditor
        initialContent={seeded({
          elements: [
            {
              type: "stroke",
              ink: "green",
              size: 8,
              points: [
                [100, 100, 0.5],
                [140, 160, 0.5],
              ],
            },
          ],
        })}
      />,
    );
    const expected = drawn(reference.container)[0]?.getAttribute("d");
    reference.unmount();

    render(<StickyEditor initialContent={seeded({})} />);
    pickUp(/pick up the green marker/i);
    const paper = paperSurface();
    down(paper, 100, 100);
    move(paper, 140, 160);
    up(paper);

    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.getAttribute("fill")).toBe("#16a34a");
    expect(drawn()[0]?.getAttribute("d")).toBe(expected);
  });

  it("draws nothing from a tap that never moves", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    pickUp(/pick up the black marker/i);
    const paper = paperSurface();
    down(paper, 100, 100);
    up(paper);

    expect(drawn()).toHaveLength(0);
  });
});

describe("StickyEditor writing", () => {
  const openBox = (at: [number, number] = [60, 80]) => {
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const paper = paperSurface();
    down(paper, at[0], at[1]);
    up(paper);
    return screen.getByRole("textbox", { name: /text box/i });
  };

  it("shows what is being typed through the note's own renderer", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    fireEvent.change(openBox(), { target: { value: "hello" } });

    // already on the paper, at the size and wrap it will keep
    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.textContent).toBe("hello");
    expect(drawn()[0]?.getAttribute("font-size")).toBe("30");
  });

  it("commits the text in the held ink and the chosen font", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    pickUp(/write in handwritten/i);
    const paper = paperSurface();
    down(paper, 60, 80);
    up(paper);

    const box = screen.getByRole("textbox", { name: /text box/i });
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.blur(box);

    expect(screen.queryByRole("textbox", { name: /text box/i })).toBeNull();
    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.getAttribute("fill")).toBe("#dc2626");
    expect(drawn()[0]?.getAttribute("font-family")).toContain("Caveat");
  });

  it("keeps a newline typed into the box", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const box = openBox();
    // Enter is the textarea's own: nothing intercepts it
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(true);
    fireEvent.change(box, { target: { value: "one\ntwo" } });
    fireEvent.blur(box);

    expect(drawn()[0]?.querySelectorAll("tspan")).toHaveLength(2);
  });

  it("adds nothing when the box is committed empty", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    fireEvent.blur(openBox());

    expect(drawn()).toHaveLength(0);
  });

  it("throws the box away on Escape", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const box = openBox();
    fireEvent.change(box, { target: { value: "no" } });
    fireEvent.keyDown(box, { key: "Escape" });
    fireEvent.blur(box);

    expect(drawn()).toHaveLength(0);
  });
});

describe("StickyEditor caret", () => {
  // Without one you cannot tell where you are typing (#74). jsdom lays out no
  // glyphs, so what runs here is the `wrapLines` fallback the first paint uses
  // — the browser refines it from the rendered tspans.
  const caret = () => document.querySelector("rect[data-caret]");
  const at = (attr: string) => Number(caret()?.getAttribute(attr));
  const openBox = () => {
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const surface = paperSurface();
    down(surface, 60, 80);
    up(surface);
    return screen.getByRole("textbox", { name: /text box/i });
  };

  it("puts a caret on the paper in the held ink as soon as the box opens", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    expect(caret()).toBeNull();

    openBox();
    expect(caret()).not.toBeNull();
    expect(caret()?.getAttribute("fill")).toBe("#dc2626");
    // it sits where the first glyph will, on the first baseline
    expect(at("x")).toBe(60);
    expect(at("height")).toBeCloseTo(30 * 1.05);
  });

  it("moves the caret along as the text grows", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const box = openBox();

    fireEvent.change(box, { target: { value: "a" } });
    const one = at("x");
    fireEvent.change(box, { target: { value: "ab" } });

    expect(one).toBeGreaterThan(60);
    expect(at("x")).toBeGreaterThan(one);
  });

  it("drops the caret a line and back to the margin on Enter", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const box = openBox();

    fireEvent.change(box, { target: { value: "ab" } });
    const first = at("y");
    fireEvent.change(box, { target: { value: "ab\n" } });

    expect(at("x")).toBe(60); // back to the left edge of the box
    expect(at("y")).toBeCloseTo(first + 30 * 1.2); // one line down
  });

  it("takes the caret away with the box, committed or thrown out", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    fireEvent.change(openBox(), { target: { value: "hi" } });
    fireEvent.blur(screen.getByRole("textbox", { name: /text box/i }));
    expect(caret()).toBeNull();

    // the marker is still in hand and still writing: open another box
    const surface = paperSurface();
    down(surface, 200, 200);
    up(surface);
    const box = screen.getByRole("textbox", { name: /text box/i });
    fireEvent.change(box, { target: { value: "no" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(caret()).toBeNull();
  });
});

describe("StickyEditor eraser and hands", () => {
  it("rubs out only the element under the nib", () => {
    render(<StickyEditor initialContent={seeded({ elements: [A, B] })} />);
    pickUp(/pick up the eraser/i);
    const paper = paperSurface();
    down(paper, 60, 80);
    up(paper);

    expect(drawn().map((el) => el.textContent)).toEqual(["aaa"]);
    // it goes on fading where it was, then leaves
    expect(screen.getByText("bbb")).toBeInTheDocument();
    wait(GHOST_MS);
    expect(screen.queryByText("bbb")).toBeNull();
  });

  it("starts a fresh fade for a rub that lands while one is still fading", () => {
    render(<StickyEditor initialContent={seeded({ elements: [A, B] })} />);
    pickUp(/pick up the eraser/i);
    const paper = paperSurface();

    down(paper, 60, 80);
    up(paper);
    const first = ghostLayer();
    expect(first?.style.opacity).toBe("1");

    wait(GHOST_MS / 2); // mid-fade: on its way out, still mounted
    expect(first?.style.opacity).toBe("0");

    down(paper, 60, 80);
    up(paper);
    // a node of its own, so it mounts opaque instead of reversing the fade
    expect(ghostLayer()).not.toBe(first);
    expect(ghostLayer()?.style.opacity).toBe("1");
  });

  it("digs one layer down when the same spot is tapped again", () => {
    render(<StickyEditor initialContent={seeded({ elements: [A, B] })} />);
    const paper = paperSurface();

    down(paper, 60, 80);
    up(paper);
    expect(selectionBox()?.getAttribute("y")).toBe("70"); // the top one

    down(paper, 60, 80);
    up(paper);
    expect(selectionBox()?.getAttribute("y")).toBe("60"); // the one under it
  });

  it("deselects on a tap on bare paper", () => {
    render(<StickyEditor initialContent={seeded({ elements: [A] })} />);
    const paper = paperSurface();
    down(paper, 60, 80);
    up(paper);
    expect(selectionBox()).not.toBeNull();

    down(paper, 400, 400);
    up(paper);
    expect(selectionBox()).toBeNull();
  });

  it("deletes an element dragged fully off the paper", () => {
    render(<StickyEditor initialContent={seeded({ elements: [A] })} />);
    const paper = paperSurface();
    down(paper, 60, 80);
    move(paper, 900, 80); // clamps at 550: the whole box leaves the sheet
    up(paper);

    expect(drawn()).toHaveLength(0);
    expect(selectionBox()).toBeNull();
  });

  it("settles an element dragged half off back into contract range", () => {
    render(<StickyEditor initialContent={seeded({ elements: [A] })} />);
    const paper = paperSurface();
    down(paper, 60, 80);
    move(paper, -200, 80); // x 40 -> -70: hanging off, but still on the sheet
    up(paper);

    expect(screen.getByText("aaa")).toBeInTheDocument();
    expect(drawn()[0]?.getAttribute("x")).toBe("-50"); // back inside -50..550
  });
});

describe("StickyEditor thumb targets", () => {
  // jsdom measures nothing, so what is asserted is the rule that holds the
  // size: every object lies in a box with a fixed width and height that no
  // flex rule may squeeze, and nothing the tool DOES may resize (#74).
  const slots = () => [
    eraserSlot(),
    tabSlot(),
    slot("pads"),
    slot("bin"),
    ...screen
      .getAllByRole("button", { name: /(pick up|put down) the .* marker/i })
      .map((el) => el as HTMLElement),
  ];

  it("lays every object in a box of its own fixed size", () => {
    render(<StickyEditor initialContent={seeded({})} />);

    for (const el of slots()) {
      expect(el?.style.width).toMatch(/^\d+px$/);
      expect(el?.style.height).toMatch(/^\d+px$/);
      expect(el?.className).not.toMatch(/(^|\s)shrink(\s|$)/);
    }
  });

  it("keeps every object at least a thumb's reach in one direction", () => {
    render(<StickyEditor initialContent={seeded({})} />);

    for (const el of slots()) {
      const w = Number.parseInt(el?.style.width ?? "0", 10);
      const h = Number.parseInt(el?.style.height ?? "0", 10);
      // a marker is only 30 wide (they sit shoulder to shoulder), so its 88px
      // height is what makes it hittable
      expect(Math.max(w, h)).toBeGreaterThanOrEqual(48);
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(30);
    }
  });

  it("stands the rocker up, one thumb wide and two tall", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const draw = screen.getByRole("button", { name: /draw with the marker/i });
    const write = screen.getByRole("button", {
      name: /write with the marker/i,
    });

    for (const half of [draw, write]) {
      expect(half.style.width).toBe("48px");
      expect(half.style.height).toBe("48px");
    }
    // squiggle above Aa, in one column
    expect(draw.parentElement).toBe(write.parentElement);
    expect(draw.parentElement?.className).toContain("flex-col");
  });

  it("keeps the strip one row at every width, corners in the corners", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const centre = screen.getByRole("button", {
      name: /pick up the red marker/i,
    }).parentElement;
    const strip = centre?.parentElement;

    // nothing may wrap, and nothing may be re-ordered onto another line
    expect(strip?.className).not.toContain("flex-wrap");
    for (const el of [strip, centre])
      expect(el?.className).not.toMatch(/max-sm:/);

    // left, centre, right — direct children of the one row, in that order
    expect([...(strip?.children ?? [])]).toEqual([
      slot("pads"),
      centre,
      eraserSlot().parentElement,
    ]);
  });

  it("closes the markers up as the strip narrows, and no further", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const centre = screen.getByRole("button", {
      name: /pick up the red marker/i,
    }).parentElement;

    // the gap between the objects in the centre is the room there is for it
    expect(centre?.style.gap).toContain("clamp(0px");
    // and past zero they lean on each other, by a capped overlap
    const marker = screen.getByRole("button", {
      name: /pick up the red marker/i,
    });
    expect(marker.style.marginInline).toContain("clamp(-4px");
  });

  // The owner's report (#74): "eraser also moves when operating the marker".
  // jsdom can't measure, so what is asserted is the invariant that kept it
  // still — the eraser's box never changes, and its lift is a transform that
  // only its own hand raises.
  it("leaves the eraser and the bin where they lie while a marker works", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const eraser = () => eraserSlot();
    const rubber = () => document.querySelector<HTMLElement>(ERASER_BODY);
    const before = [eraser()?.style.cssText, slot("bin")?.style.cssText];
    const still = rubber()?.style.transform;

    pickUp(/pick up the red marker/i);
    expect([eraser()?.style.cssText, slot("bin")?.style.cssText]).toEqual(
      before,
    );
    expect(rubber()?.style.transform).toBe(still);

    // and through a whole stroke: `using` belongs to the tool in your hand
    const paper = paperSurface();
    down(paper, 100, 100);
    move(paper, 140, 160);
    expect([eraser()?.style.cssText, slot("bin")?.style.cssText]).toEqual(
      before,
    );
    expect(rubber()?.style.transform).toBe(still);
    up(paper);
  });

  it("lifts the eraser itself, by transform alone, when it is the one held", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const box = () => eraserSlot().style.cssText;
    const rubber = () => document.querySelector<HTMLElement>(ERASER_BODY);
    const before = box();

    pickUp(/pick up the eraser/i);
    expect(rubber()?.style.transform).toContain("translateY(-17px)");
    expect(box()).toBe(before); // the box it lies in never moved
  });

  it("pops the font samples over the mat instead of onto the strip", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    pickUp(/pick up the red marker/i);
    const casual = () =>
      screen.queryByRole("button", { name: /write in casual/i });
    expect(casual()).toBeNull();

    pickUp(/write with the marker/i);
    expect(casual()?.style.height).toBe("48px");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(casual()).toBeNull();
  });
});

describe("StickyEditor pointer gestures", () => {
  const full = () =>
    seeded({ elements: Array.from({ length: MAX_ELEMENTS }, () => HI) });

  it("focuses the text box as the placing tap ends, not a frame later", () => {
    // iOS Safari raises the keyboard only for a focus() inside the gesture.
    render(<StickyEditor initialContent={seeded({})} />);
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const paper = paperSurface();

    down(paper, 60, 80);
    const box = screen.getByRole("textbox", { name: /text box/i });
    expect(box).not.toHaveFocus();

    up(paper);
    expect(box).toHaveFocus();
  });

  it("takes the browser's default off a tap on the paper", () => {
    // the compatibility mousedown would blur the open box straight back out
    render(<StickyEditor initialContent={seeded({})} />);
    expect(down(paperSurface(), 60, 80)).toBe(false);
  });

  it("commits the open box on a tap away, and starts the next one", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    fireEvent.change(
      (() => {
        pickUp(/pick up the red marker/i);
        pickUp(/write with the marker/i);
        const paper = paperSurface();
        down(paper, 60, 80);
        up(paper);
        return screen.getByRole("textbox", { name: /text box/i });
      })(),
      { target: { value: "hi" } },
    );

    const paper = paperSurface();
    down(paper, 400, 400);
    up(paper);

    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /text box/i })).toHaveFocus();
  });

  it("ignores a second finger while a stroke is live", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    pickUp(/pick up the black marker/i);
    const paper = paperSurface();

    down(paper, 100, 100);
    move(paper, 300, 300, 2); // another finger lands: not this gesture's
    up(paper);

    // one point only, so perfect-freehand drew nothing
    expect(drawn()).toHaveLength(0);
  });

  it("opens no draft once the note is full, and says so", () => {
    render(<StickyEditor initialContent={full()} />);
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const paper = paperSurface();
    down(paper, 400, 400);
    up(paper);

    expect(screen.queryByRole("textbox", { name: /text box/i })).toBeNull();
    expect(drawn()).toHaveLength(MAX_ELEMENTS);
    expect(
      screen.getByRole("button", { name: /put down the red marker/i }).style
        .animation,
    ).toContain("desk-shake");
  });
});

describe("StickyEditor sticker sheet", () => {
  const tab = () => screen.getByRole("button", { name: /the sticker sheet/i });
  const cell = (emoji: string) =>
    screen.getByRole("button", { name: `Peel the ${emoji} sticker` });
  const upAt = (el: HTMLElement, x: number, y: number) =>
    fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1 });
  // peel one off the sheet and let go at a point on the mat
  const dragTo = (emoji: string, x: number, y: number) => {
    // a placement leaves the sheet up, so only pull it out when it is away
    if (tab().getAttribute("aria-expanded") === "false") fireEvent.click(tab());
    const slot = cell(emoji);
    down(slot, 300, 600);
    move(slot, x, y);
    upAt(slot, x, y);
    return slot;
  };

  it("pulls the sheet up from the tab and puts it away again", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    expect(tab()).toHaveAttribute("aria-expanded", "false");
    // parked below the mat's edge: inert, so nothing on it is reachable —
    // not by the pointer, the tab order or the screen reader
    expect(slot("sheet")).toHaveAttribute("inert");

    fireEvent.click(tab());
    expect(tab()).toHaveAttribute("aria-expanded", "true");
    expect(slot("sheet")).not.toHaveAttribute("inert");
    expect(screen.getAllByRole("button", { name: /peel the/i })).toHaveLength(
      STICKER_EMOJI.length,
    );

    fireEvent.click(tab());
    expect(tab()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the sheet on Escape", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    fireEvent.click(tab());
    fireEvent.keyDown(window, { key: "Escape" });

    expect(tab()).toHaveAttribute("aria-expanded", "false");
  });

  it("moves the note clear of the sheet while it is up", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    const stage = () => paperSurface().parentElement;
    expect(stage()?.style.transform).toBe("none");

    fireEvent.click(tab());
    expect(stage()?.style.transform).toContain("translateY(-12%)");
  });

  it("sticks a peeled sticker where it was dropped on the paper", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    paperSurface(); // 500x500 at the origin: client coords ARE note coords
    const slot = dragTo("⭐", 250, 250);

    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.textContent).toBe("⭐");
    expect(drawn()[0]?.getAttribute("x")).toBe("250");
    expect(drawn()[0]?.getAttribute("y")).toBe("250");
    // the sheet is infinite: the slot is printed again, and still up
    expect(slot).not.toHaveAttribute("data-peeled");
    expect(tab()).toHaveAttribute("aria-expanded", "true");
  });

  it("peels the same sticker as many times as it is asked for", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    paperSurface();
    dragTo("🔥", 100, 100);
    dragTo("🔥", 400, 300);

    expect(drawn().map((el) => el.getAttribute("x"))).toEqual(["100", "400"]);
  });

  it("marks the slot bare while its sticker is in flight", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    paperSurface();
    fireEvent.click(tab());
    down(cell("⭐"), 300, 600);

    expect(cell("⭐")).toHaveAttribute("data-peeled");
    expect(drawn()).toHaveLength(0);
  });

  it("sticks nothing when the sticker is let go off the paper", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    paperSurface();
    const slot = dragTo("⭐", 900, 900);

    expect(drawn()).toHaveLength(0);
    wait(400); // it flies home, then the slot is printed again
    expect(slot).not.toHaveAttribute("data-peeled");
  });

  it("lifts nothing off a full note", () => {
    render(
      <StickyEditor
        initialContent={seeded({
          elements: Array.from({ length: MAX_ELEMENTS }, () => HI),
        })}
      />,
    );
    paperSurface();
    fireEvent.click(tab());
    down(cell("⭐"), 300, 600);
    expect(cell("⭐")).not.toHaveAttribute("data-peeled"); // nothing lifts
    upAt(cell("⭐"), 250, 250);

    expect(drawn()).toHaveLength(MAX_ELEMENTS);
  });

  it("refuses a drop that the committed box left no room for", () => {
    render(
      <StickyEditor
        initialContent={seeded({
          elements: Array.from({ length: MAX_ELEMENTS - 1 }, () => HI),
        })}
      />,
    );
    paperSurface();
    // one free slot, and an open box about to take it
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    down(paperSurface(), 60, 80);
    up(paperSurface());
    fireEvent.change(screen.getByRole("textbox", { name: /text box/i }), {
      target: { value: "last" },
    });
    const slot = dragTo("⭐", 250, 250);

    // the text committed; the sticker was refused, not silently dropped
    expect(drawn()).toHaveLength(MAX_ELEMENTS);
    expect(drawn().at(-1)?.textContent).toBe("last");
    expect(slot).toHaveAttribute("data-peeled"); // on its way home
    wait(400);
    expect(slot).not.toHaveAttribute("data-peeled");
  });

  it("keeps the sheet up when Escape throws an open box away", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    paperSurface();
    fireEvent.click(tab());
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    down(paperSurface(), 60, 80);
    up(paperSurface());
    const box = screen.getByRole("textbox", { name: /text box/i });
    fireEvent.change(box, { target: { value: "no" } });

    fireEvent.keyDown(box, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: /text box/i })).toBeNull();
    expect(drawn()).toHaveLength(0);
    expect(tab()).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the marker in your hand through a peel and a drop", () => {
    render(<StickyEditor initialContent={seeded({})} />);
    paperSurface();
    pickUp(/pick up the green marker/i);
    pickUp(/write with the marker/i);
    dragTo("🎉", 250, 250);

    expect(
      screen.getByRole("button", { name: /put down the green marker/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /write with the marker/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
