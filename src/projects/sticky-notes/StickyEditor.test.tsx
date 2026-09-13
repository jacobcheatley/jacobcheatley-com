import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Element, emptyNote } from "./note-editor";
import type { NoteContent } from "./note-schema";
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
const move = (el: HTMLElement, x: number, y: number) =>
  fireEvent.pointerMove(el, {
    clientX: x,
    clientY: y,
    pointerId: 1,
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
    down(paperSurface(), at[0], at[1]);
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
    down(paperSurface(), 60, 80);

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

  it("starts every rubbed-out element's fade opaque, not just the first", () => {
    render(<StickyEditor initialContent={seeded({ elements: [A, B] })} />);
    pickUp(/pick up the eraser/i);
    const paper = paperSurface();

    down(paper, 60, 80);
    up(paper);
    expect(ghostLayer()?.style.opacity).toBe("1");
    wait(GHOST_MS);
    expect(ghostLayer()).toBeUndefined();

    down(paper, 60, 80);
    up(paper);
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
