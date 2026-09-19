import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAD_JITTER, PIN_ROOM } from "./desk-objects";
import { emptyNote } from "./note-editor";
import {
  MAX_ELEMENTS,
  type NoteContent,
  type NoteElement,
  PAPER_COLOURS,
  STICKER_EMOJI,
} from "./note-schema";
import StickyEditor from "./StickyEditor";

// A note is born at the pad chooser and dies in the bin, which sends the mat
// back to the chooser. Motion is CSS; these tests assert the state a transition
// carries, never the transition itself.

// The page always gives the editor somewhere to pin a note up to; only the
// tests about the pinning itself look at what goes there.
const editor = (props: Partial<ComponentProps<typeof StickyEditor>> = {}) => (
  <StickyEditor onPinning={() => {}} {...props} />
);

// The crumple and the rubbed-out fade only finish once their timer has run, so
// the whole file runs on fake timers and steps past them explicitly.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const CRUMPLED = 600; // > CRUMPLE_MS
const TORN = 600; // > TEAR_MS
const FADED = 400; // > the rubbed-out fade
const FLOWN_HOME = 400; // > a missed sticker's flight back to the sheet
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

// a pad is the only button whose label ends in that colour's sheet: the markers
// name colours too ("Pick up the blue marker")
const pad = (colour: string) =>
  screen.getByRole("button", { name: new RegExp(`${colour} sheet`, "i") });
const pads = () => screen.getAllByRole("button", { name: /tear off/i });
// the torn pad is hidden, so out of the role query: ask the DOM for all six
const allPads = () => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="chooser"] button'),
];
const bin = () => screen.getByRole("button", { name: /bin this note/i });
const slot = (name: string) =>
  document.querySelector<HTMLElement>(`[data-slot="${name}"]`);
// The eraser and the sticker tab ARE their own boxes: no wrapper sets a second
// one, so they are found the way a visitor finds them.
const eraserSlot = () => screen.getByRole("button", { name: /the eraser/i });
// The open sheet's folded corner answers to "Close the sticker sheet" too, so
// ask the tray for this one.
const tabSlot = () =>
  within(tray() as HTMLElement).getByRole("button", {
    name: /the sticker sheet/i,
  });
const ERASER_BODY = '[data-object="eraser"]';
const note = () => screen.queryByRole("img", { name: /sticky note/i });
const paper = () =>
  note()?.closest("[data-colour]")?.getAttribute("data-colour");

const chooser = () => slot("chooser");
const tray = () => slot("tray");
const hand = () => screen.getByRole("button", { name: /the hand$/i });
const marker = (ink: string) =>
  screen.getByRole("button", { name: new RegExp(`the ${ink} marker$`, "i") });

const HI: NoteElement = {
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

// `emptyNote` seeds a random tilt, and a tilted note maps a client point to a
// different note coordinate: every test that presses a coordinate starts square
// to the screen and asks for the tilt explicitly.
const seeded = (over: Partial<NoteContent>): NoteContent => ({
  ...emptyNote(),
  rotation: 0,
  ...over,
});
// no curl: a corner fold would take a press meant for the paper
const flat = { bl: 0, br: 0 };

describe("StickyEditor pad chooser", () => {
  it("fills a bare mat with the six pads, and nothing else to reach", () => {
    render(editor());

    expect(note()).toBeNull();
    expect(pads()).toHaveLength(6);
    expect(chooser()).not.toHaveAttribute("inert");
    expect(tray()).toHaveAttribute("inert");
    expect(bin()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /pin it up/i })).toBeNull();
  });

  it("puts the keyboard on the first pad", () => {
    render(editor());
    expect(pad("yellow")).toHaveFocus();
  });

  it("lies every pad a little askew, the same way on every render", () => {
    const { rerender } = render(editor());
    const turned = () => pads().map((p) => p.style.transform);

    expect(turned()).toHaveLength(6);
    PAPER_COLOURS.forEach((colour, i) => {
      const { deg, dx, dy } = PAD_JITTER[colour];
      expect(turned()[i]).toContain(`rotate(${deg}deg)`);
      expect(turned()[i]).toContain(`translate(${dx}px, ${dy}px)`);
    });

    const before = turned();
    rerender(editor());
    expect(turned()).toEqual(before);
  });

  it("puts the chooser away without straightening the pads, and takes only the torn colour", () => {
    render(editor());
    fireEvent.click(pad("blue"));

    expect(pads()).toHaveLength(5);
    for (const p of allPads()) {
      expect(p.style.transform).toContain("12vh"); // the slide off the mat
      expect(p.style.transform).toContain("rotate(");
    }
    const hidden = allPads().map((p) => p.style.visibility === "hidden");
    expect(hidden).toEqual(PAPER_COLOURS.map((c) => c === "blue"));
  });

  it("tears a sheet off the pad tapped, and puts the chooser away for the tray", () => {
    render(editor());
    fireEvent.click(pad("blue"));

    expect(paper()).toBe("blue");
    expect(chooser()).toHaveAttribute("inert");
    expect(tray()).not.toHaveAttribute("inert");
    expect(
      screen.getByRole("button", { name: /pin it up/i }),
    ).toBeInTheDocument();
    expect(marker("black")).toHaveAttribute("aria-pressed", "true");
  });

  it("sticks pin it up just above the note, in its unrotated frame, even on a blank note", () => {
    render(editor({ initialContent: seeded({ rotation: 12 }) }));
    const pinButton = screen.getByRole("button", { name: /pin it up/i });
    const surface = note()?.closest("[data-colour]");

    // the frame that moves and shrinks with the sticker sheet, not the paper
    // that turns inside it
    expect(pinButton.parentElement).toBe(surface?.parentElement);
    expect(surface).not.toContainElement(pinButton);
    expect(pinButton).toBeEnabled();
  });

  it("offers no way to change the paper once it is torn", () => {
    render(editor({ initialContent: seeded({ colour: "pink" }) }));
    expect(chooser()).toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: /paper/i })).toBeNull();
  });
});

describe("StickyEditor bin", () => {
  const slip = () => screen.queryByRole("group", { name: /bin it\?/i });
  const yes = () => screen.getByRole("button", { name: "Bin it" });

  it("asks before binning a note with something on it", () => {
    render(editor({ initialContent: seeded({ elements: [HI] }) }));
    fireEvent.click(bin());

    expect(slip()).not.toBeNull();
    expect(yes()).toHaveFocus();
    wait(CRUMPLED);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it.each([
    [
      "Keep it",
      () => fireEvent.click(screen.getByRole("button", { name: "Keep it" })),
    ],
    [
      "Escape",
      () =>
        fireEvent.keyDown(document.activeElement as HTMLElement, {
          key: "Escape",
        }),
    ],
    ["a press anywhere else", () => fireEvent.pointerDown(document.body)],
  ])("keeps the note on %s", (_, answer) => {
    render(editor({ initialContent: seeded({ elements: [HI] }) }));
    fireEvent.click(bin());
    answer();

    expect(slip()).toBeNull();
    expect(bin()).toHaveFocus();
    wait(CRUMPLED);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(chooser()).toHaveAttribute("inert");
  });

  it("keeps the note on a second tap on the bin, and doesn't ask again", () => {
    render(editor({ initialContent: seeded({ elements: [HI] }) }));
    fireEvent.click(bin());
    press(/bin this note/i);

    expect(slip()).toBeNull();
    expect(bin()).toHaveFocus();
    wait(CRUMPLED);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("keeps the note when the keyboard tabs away from the slip", () => {
    render(editor({ initialContent: seeded({ elements: [HI] }) }));
    fireEvent.click(bin());
    const pinButton = screen.getByRole("button", { name: /pin it up/i });
    act(() => pinButton.focus());

    expect(slip()).toBeNull();
    expect(pinButton).toHaveFocus();
    wait(CRUMPLED);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("crumples once, however many times it is told", () => {
    // timeouts only, so the count is the editor's own and not React's
    // scheduler (which runs on setImmediate)
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { unmount } = render(
      editor({ initialContent: seeded({ elements: [HI] }) }),
    );
    fireEvent.click(bin());
    // two activations before React re-renders, so both reach the tick
    const tick = yes();
    const before = vi.getTimerCount();
    act(() => {
      tick.click();
      tick.click();
    });
    expect(vi.getTimerCount()).toBe(before + 1);

    unmount(); // mid-crumple: nothing is left to fire on a gone editor
    expect(vi.getTimerCount()).toBe(before);
  });

  it("lets the press that keeps the note go on to do its own job", () => {
    render(editor({ initialContent: seeded({ curl: flat, elements: [HI] }) }));
    fireEvent.click(bin());

    const surface = paperSurface();
    down(surface, 100, 300);
    move(surface, 200, 350);
    up(surface);
    expect(slip()).toBeNull();
    expect(drawn()).toHaveLength(2);
  });

  it("crumples the note once told to, and the chooser comes back", () => {
    render(editor({ initialContent: seeded({ elements: [HI] }) }));
    fireEvent.click(bin());
    fireEvent.click(yes());

    expect(slip()).toBeNull();
    expect(screen.getByText("hi")).toBeInTheDocument(); // on its way in
    wait(CRUMPLED);
    expect(note()).toBeNull();
    expect(chooser()).not.toHaveAttribute("inert");
    expect(tray()).toHaveAttribute("inert");
    expect(pad("yellow")).toHaveFocus();
  });

  it("bins a blank note at once, and the next sheet starts with the black marker", () => {
    render(editor({ initialContent: seeded({}) }));
    pickUp(/pick up the red marker/i);
    fireEvent.click(bin());

    expect(slip()).toBeNull();
    wait(CRUMPLED);
    expect(note()).toBeNull();
    // jsdom lets a press through an inert chooser, so ask the attribute
    expect(chooser()).not.toHaveAttribute("inert");
    fireEvent.click(pad("green"));
    expect(paper()).toBe("green");
    expect(marker("black")).toHaveAttribute("aria-pressed", "true");
  });

  it("takes pin it up down while a note flies, until the next sheet has landed", () => {
    // it stands beside the paper, not on it, so a flight would leave it behind
    render(editor({ initialContent: seeded({}) }));
    const pinButton = () => screen.getByRole("button", { name: /pin it up/i });
    expect(pinButton()).not.toHaveAttribute("inert");

    fireEvent.click(bin()); // blank: straight in
    expect(pinButton()).toHaveAttribute("inert");
    wait(CRUMPLED);

    fireEvent.click(pad("green"));
    expect(pinButton()).toHaveAttribute("inert");
    wait(TORN);
    expect(pinButton()).not.toHaveAttribute("inert");
  });
});

describe("StickyEditor tools", () => {
  it("tears a sheet off with the black marker in hand and the rocker live", () => {
    render(editor());
    fireEvent.click(pad("blue"));
    expect(marker("black")).toHaveAccessibleName("Put down the black marker");
    expect(marker("black")).toHaveAttribute("aria-pressed", "true");
    expect(hand()).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /draw with the marker/i }),
    ).toBeEnabled();
  });

  it("holds the black marker until another is picked up, and the hand once it is put down", () => {
    render(editor());
    fireEvent.click(pad("blue"));

    pickUp(/pick up the red marker/i);
    expect(marker("black")).toHaveAttribute("aria-pressed", "false");
    expect(hand()).toHaveAccessibleName("Pick up the hand");
    expect(hand()).toHaveAttribute("aria-pressed", "false");

    pickUp(/put down the red marker/i);
    expect(hand()).toHaveAttribute("aria-pressed", "true");
  });

  it("puts the eraser down when the hand is picked up", () => {
    render(editor({ initialContent: seeded({}) }));
    pickUp(/pick up the eraser/i);
    pickUp(/pick up the hand/i);

    expect(hand()).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /pick up the eraser/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("gives the hand back when the eraser is put down", () => {
    render(editor({ initialContent: seeded({}) }));
    pickUp(/pick up the eraser/i);
    pickUp(/put down the eraser/i);

    expect(hand()).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the hand when the hand is tapped again", () => {
    render(editor({ initialContent: seeded({}) }));
    pickUp(/pick up the hand/i);
    pickUp(/put down the hand/i);
    expect(hand()).toHaveAttribute("aria-pressed", "true");
  });

  it("picks a marker up and puts it down again", () => {
    render(editor({ initialContent: seeded({}) }));

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
    render(editor({ initialContent: seeded({}) }));
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
    render(editor({ initialContent: seeded({}) }));
    const draw = () =>
      screen.getByRole("button", { name: /draw with the marker/i });
    pickUp(/pick up the hand/i);
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
const placingOutline = () => document.querySelector("rect[stroke-dasharray]");
const handle = (name: "corner" | "width") =>
  document.querySelector(`[data-handle="${name}"]`);
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
// a torn sheet comes with the black marker in hand, so hand mode is asked for
const takeHand = () => pickUp(/pick up the hand/i);
// A real press on something on the mat: the pointer comes down, then the click.
const press = (name: RegExp) => {
  const el = screen.getByRole("button", { name });
  fireEvent.pointerDown(el);
  fireEvent.click(el);
};
// A tap on the paper well clear of the boxes these tests open at (60, 80).
const tapAway = () => {
  const surface = paperSurface();
  down(surface, 400, 420);
  up(surface);
};
// A click with no pointer-down, so it is "pin it up" itself that fixes what is
// being placed.
const pinned = (onPinning: ReturnType<typeof vi.fn>) => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: /pin it up/i }));
  return onPinning.mock.calls.at(-1)?.[0]?.elements;
};

// two text boxes that overlap around (60, 80) — B (last) draws on top of A
const A: NoteElement = { ...HI, x: 40, y: 60, text: "aaa" };
const B: NoteElement = { ...HI, x: 50, y: 70, text: "bbb" };

describe("StickyEditor drawing", () => {
  it("draws a stroke in the held ink at the fixed nib", () => {
    // the same two points, stored as a size-8 green stroke: the drawn path must
    // come out identical
    const reference = render(
      editor({
        initialContent: seeded({
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
        }),
      }),
    );
    const expected = drawn(reference.container)[0]?.getAttribute("d");
    reference.unmount();

    render(editor({ initialContent: seeded({}) }));
    pickUp(/pick up the green marker/i);
    const paper = paperSurface();
    down(paper, 100, 100);
    move(paper, 140, 160);
    up(paper);

    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.getAttribute("fill")).toBe("#16a34a");
    expect(drawn()[0]?.getAttribute("d")).toBe(expected);
  });

  it("stores every point at pressure 0.5, whatever the pointer reported", () => {
    // a marker has no pressure: a touch (1) and a light pen (0.1) must leave
    // the same numbers behind as a mouse
    const onPinning = vi.fn();
    render(editor({ initialContent: seeded({}), onPinning }));
    const paper = paperSurface();
    fireEvent.pointerDown(paper, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      pointerType: "touch",
      pressure: 1,
    });
    fireEvent.pointerMove(paper, {
      clientX: 140,
      clientY: 160,
      pointerId: 1,
      pointerType: "pen",
      pressure: 0.1,
    });
    up(paper);

    const points = pinned(onPinning)?.flatMap((el: NoteElement) =>
      el.type === "stroke" ? el.points : [],
    );
    expect(points?.length).toBeGreaterThanOrEqual(2);
    expect(points?.map((p: number[]) => p[2])).toEqual(points?.map(() => 0.5));
  });

  it("draws nothing from a tap that never moves", () => {
    render(editor({ initialContent: seeded({}) }));
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
    render(editor({ initialContent: seeded({}) }));
    fireEvent.change(openBox(), { target: { value: "hello" } });

    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.textContent).toBe("hello");
    expect(drawn()[0]?.getAttribute("font-size")).toBe("30");
  });

  it("commits the text in the held ink and the chosen font", () => {
    render(editor({ initialContent: seeded({}) }));
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    pickUp(/write in handwritten/i);
    const paper = paperSurface();
    down(paper, 60, 80);
    up(paper);

    const box = screen.getByRole("textbox", { name: /text box/i });
    fireEvent.change(box, { target: { value: "hello" } });
    tapAway();

    expect(screen.queryByRole("textbox", { name: /text box/i })).toBeNull();
    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.getAttribute("fill")).toBe("#dc2626");
    expect(drawn()[0]?.getAttribute("font-family")).toContain("Caveat");
  });

  it("keeps a newline typed into the box", () => {
    render(editor({ initialContent: seeded({}) }));
    const box = openBox();
    // true: nothing called preventDefault, so the textarea gets its newline
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(true);
    fireEvent.change(box, { target: { value: "one\ntwo" } });
    tapAway();

    expect(drawn()[0]?.querySelectorAll("tspan")).toHaveLength(2);
  });

  it("adds nothing when the box is fixed empty", () => {
    render(editor({ initialContent: seeded({}) }));
    openBox();
    tapAway();

    expect(drawn()).toHaveLength(0);
  });

  it("throws the box away on Escape", () => {
    render(editor({ initialContent: seeded({}) }));
    const box = openBox();
    fireEvent.change(box, { target: { value: "no" } });
    fireEvent.keyDown(box, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: /text box/i })).toBeNull();
    expect(drawn()).toHaveLength(0);
  });

  it("keeps the box open when the textarea loses focus: only a press fixes it", () => {
    // a phone's keyboard going away blurs the box without a press anywhere
    render(editor({ initialContent: seeded({}) }));
    const box = openBox();
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.blur(box);

    expect(placingOutline()).not.toBeNull();
  });
});

describe("StickyEditor caret", () => {
  // jsdom lays out no glyphs, so what runs here is the `wrapLines` fallback the
  // first paint uses; the browser refines it from the rendered tspans.
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
    render(editor({ initialContent: seeded({}) }));
    expect(caret()).toBeNull();

    openBox();
    expect(caret()).not.toBeNull();
    expect(caret()?.getAttribute("fill")).toBe("#dc2626");
    // it sits where the first glyph will, on the first baseline
    expect(at("x")).toBe(60);
    expect(at("height")).toBeCloseTo(30 * 1.05);
  });

  it("moves the caret along as the text grows", () => {
    render(editor({ initialContent: seeded({}) }));
    const box = openBox();

    fireEvent.change(box, { target: { value: "a" } });
    const one = at("x");
    fireEvent.change(box, { target: { value: "ab" } });

    expect(one).toBeGreaterThan(60);
    expect(at("x")).toBeGreaterThan(one);
  });

  it("drops the caret a line and back to the margin on Enter", () => {
    render(editor({ initialContent: seeded({}) }));
    const box = openBox();

    fireEvent.change(box, { target: { value: "ab" } });
    const first = at("y");
    fireEvent.change(box, { target: { value: "ab\n" } });

    expect(at("x")).toBe(60);
    expect(at("y")).toBeCloseTo(first + 30 * 1.2);
  });

  it("takes the caret away with the box, committed or thrown out", () => {
    render(editor({ initialContent: seeded({}) }));
    fireEvent.change(openBox(), { target: { value: "hi" } });
    tapAway();
    expect(caret()).toBeNull();

    const surface = paperSurface();
    down(surface, 200, 200);
    up(surface);
    const box = screen.getByRole("textbox", { name: /text box/i });
    fireEvent.change(box, { target: { value: "no" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(caret()).toBeNull();
  });
});

describe("StickyEditor eraser", () => {
  it("rubs out only the element under the nib", () => {
    render(editor({ initialContent: seeded({ elements: [A, B] }) }));
    pickUp(/pick up the eraser/i);
    const paper = paperSurface();
    down(paper, 60, 80);
    up(paper);

    expect(drawn().map((el) => el.textContent)).toEqual(["aaa"]);
    expect(screen.getByText("bbb")).toBeInTheDocument();
    wait(FADED);
    expect(screen.queryByText("bbb")).toBeNull();
  });

  it("starts a fresh fade for a rub that lands while one is still fading", () => {
    render(editor({ initialContent: seeded({ elements: [A, B] }) }));
    pickUp(/pick up the eraser/i);
    const paper = paperSurface();

    down(paper, 60, 80);
    up(paper);
    const first = ghostLayer();
    expect(first?.style.opacity).toBe("1");

    wait(FADED / 2); // mid-fade: on its way out, still mounted
    expect(first?.style.opacity).toBe("0");

    down(paper, 60, 80);
    up(paper);
    // a node of its own, so it mounts opaque instead of reversing the fade
    expect(ghostLayer()).not.toBe(first);
    expect(ghostLayer()?.style.opacity).toBe("1");
  });
});

describe("StickyEditor tray", () => {
  it("lays the tray out as one centred row: hand, markers, draw/write, sticker tab, eraser, bin", () => {
    render(editor({ initialContent: seeded({}) }));
    const row = tray() as HTMLElement;

    expect(
      [...row.querySelectorAll("button")].map((b) =>
        b.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Pick up the hand",
      "Put down the black marker",
      "Pick up the green marker",
      "Pick up the red marker",
      "Pick up the blue marker",
      "Draw with the marker",
      "Write with the marker",
      "Open the sticker sheet",
      "Pick up the eraser",
      "Bin this note",
    ]);
  });

  // jsdom can't measure, so what is asserted is the invariant that keeps the
  // eraser still: its box never changes, and its lift is a transform that only
  // its own hand raises.
  it("leaves the eraser and the bin where they lie while a marker works", () => {
    render(editor({ initialContent: seeded({}) }));
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
});

describe("StickyEditor pointer gestures", () => {
  const full = () =>
    seeded({ elements: Array.from({ length: MAX_ELEMENTS }, () => HI) });

  it("focuses the text box as the placing tap ends, not a frame later", () => {
    // iOS Safari raises the keyboard only for a focus() inside the gesture.
    render(editor({ initialContent: seeded({}) }));
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
    render(editor({ initialContent: seeded({}) }));
    expect(down(paperSurface(), 60, 80)).toBe(false);
  });

  it("fixes the open box on a tap away, and that tap opens no second one", () => {
    render(editor({ initialContent: seeded({}) }));
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const paper = paperSurface();
    down(paper, 60, 80);
    up(paper);
    fireEvent.change(screen.getByRole("textbox", { name: /text box/i }), {
      target: { value: "hi" },
    });

    down(paper, 400, 400);
    up(paper);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /text box/i })).toBeNull();

    down(paper, 400, 400);
    up(paper);
    expect(screen.getByRole("textbox", { name: /text box/i })).toHaveFocus();
  });

  it("ignores a second finger while a stroke is live", () => {
    render(editor({ initialContent: seeded({}) }));
    const paper = paperSurface();

    down(paper, 100, 100);
    move(paper, 300, 300, 2);
    up(paper);

    // one point only, so perfect-freehand drew nothing
    expect(drawn()).toHaveLength(0);
  });

  it("opens no draft once the note is full, and says so", () => {
    render(editor({ initialContent: full() }));
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

const tab = tabSlot;
const sheetCorner = () =>
  within(slot("sheet") as HTMLElement).getByRole("button", {
    name: /close the sticker sheet/i,
  });
const cell = (emoji: string) =>
  screen.getByRole("button", { name: `Peel the ${emoji} sticker` });
const dragTo = (emoji: string, x: number, y: number) => {
  // a placement leaves the sheet up, so only pull it out when it is away
  if (tab().getAttribute("aria-expanded") === "false") fireEvent.click(tab());
  const slot = cell(emoji);
  down(slot, 300, 600);
  move(slot, x, y);
  fireEvent.pointerUp(slot, { clientX: x, clientY: y, pointerId: 1 });
  return slot;
};

describe("StickyEditor sticker sheet", () => {
  const upAt = (el: HTMLElement, x: number, y: number) =>
    fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1 });

  it("pulls the sheet up from the tab and puts it away again", () => {
    render(editor({ initialContent: seeded({}) }));
    expect(tab()).toHaveAttribute("aria-expanded", "false");
    expect(slot("sheet")).toHaveAttribute("inert");

    fireEvent.click(tab());
    expect(tab()).toHaveAttribute("aria-expanded", "true");
    expect(slot("sheet")).not.toHaveAttribute("inert");
    expect(screen.getAllByRole("button", { name: /peel the/i })).toHaveLength(
      STICKER_EMOJI.length,
    );

    fireEvent.click(sheetCorner());
    expect(tab()).toHaveAttribute("aria-expanded", "false");
  });

  // The sheet covers the tray, so the tab is under it: hence three ways down.
  it.each([
    ["its folded corner", () => fireEvent.click(sheetCorner())],
    [
      "a swipe down its handle",
      () => {
        const grip = slot("sheet-handle") as HTMLElement;
        down(grip, 160, 400);
        move(grip, 160, 460);
      },
    ],
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
  ])("puts the sheet away on %s, with the marker back in hand", (_, close) => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    const surface = paperSurface();
    fireEvent.click(tab());
    close();

    expect(tab()).toHaveAttribute("aria-expanded", "false");
    expect(tray()).not.toHaveAttribute("inert");
    expect(marker("black")).toHaveAttribute("aria-pressed", "true");
    down(surface, 100, 100);
    move(surface, 160, 180);
    up(surface);
    expect(drawn()).toHaveLength(1);
  });

  it("leaves Escape to the wall once the mat has gone down", () => {
    const content = seeded({});
    const { rerender } = render(editor({ initialContent: content }));
    fireEvent.click(tab());
    rerender(editor({ initialContent: content, up: false }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(tab()).toHaveAttribute("aria-expanded", "true");
  });

  it("stands the note in the room above the sheet, at the size it already was", () => {
    render(editor({ initialContent: seeded({}) }));
    const frame = () => paperSurface().parentElement as HTMLElement;
    const room = () => frame().parentElement as HTMLElement;
    expect(room().style.top).toBe(`${PIN_ROOM}px`);

    fireEvent.click(tab());
    // "pin it up" is away, so the room it stood in is the note's
    expect(room().style.top).toBe("0px");
    expect(frame().style.transform).not.toContain("scale(");

    fireEvent.click(sheetCorner());
    expect(room().style.top).toBe(`${PIN_ROOM}px`);
  });

  it("covers the tray and takes it out of reach while it is up", () => {
    render(editor({ initialContent: seeded({}) }));
    const box = tabSlot().style.cssText;

    fireEvent.click(tab());
    expect(tab()).toHaveAttribute("aria-expanded", "true");
    expect(tabSlot().style.cssText).toBe(box);
    expect(tray()).toContainElement(tab());
    expect(tray()).toHaveAttribute("inert");
    expect(tray()?.style.opacity).toBe("0.4");

    fireEvent.click(sheetCorner());
    expect(tray()).not.toHaveAttribute("inert");
    expect(tray()?.style.opacity).toBe("1");
  });

  it("is the thing you hold: no stroke, no turn, no curl while it is up", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    const surface = paperSurface();
    fireEvent.click(tab());

    expect(marker("black")).toHaveAttribute("aria-pressed", "true");
    down(surface, 100, 100);
    move(surface, 160, 180);
    up(surface);
    expect(drawn()).toHaveLength(0);
    expect(surface.style.transform).toContain("rotate(0deg)");
  });

  it("rubs nothing out with the eraser held while the sheet is up", () => {
    render(editor({ initialContent: seeded({ elements: [A, B] }) }));
    pickUp(/pick up the eraser/i);
    fireEvent.click(tab());

    const paper = paperSurface();
    down(paper, 60, 80);
    move(paper, 70, 90);
    up(paper);
    wait(FADED);
    expect(drawn().map((el) => el.textContent)).toEqual(["aaa", "bbb"]);
  });

  it("turns nothing with the hand held while the sheet is up", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    takeHand();
    const surface = paperSurface();
    fireEvent.click(tab());

    down(surface, 6, 250); // out by the left edge, where a drag turns it
    move(surface, 6, 150);
    up(surface);
    expect(surface.style.transform).toContain("rotate(0deg)");
  });

  it("takes only the peeled sticker's placing while the sheet is up", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    const surface = paperSurface();
    dragTo("⭐", 250, 250);
    expect(placingOutline()).not.toBeNull();

    down(surface, 400, 60);
    move(surface, 400, 160);
    up(surface);
    expect(placingOutline()).toBeNull();
    expect(surface.style.transform).toContain("rotate(0deg)");
    expect(drawn().map((el) => el.textContent)).toEqual(["⭐"]);
  });

  it("takes pin it up down while the sheet is up, and while a box is open", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    const pinButton = () => screen.getByRole("button", { name: /pin it up/i });
    expect(pinButton()).not.toHaveAttribute("inert");

    fireEvent.click(tab());
    expect(pinButton()).toHaveAttribute("inert");
    fireEvent.click(sheetCorner());
    expect(pinButton()).not.toHaveAttribute("inert");

    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const surface = paperSurface();
    down(surface, 60, 80);
    up(surface);
    expect(pinButton()).toHaveAttribute("inert");
    tapAway();
    expect(pinButton()).not.toHaveAttribute("inert");
  });

  it("sticks a peeled sticker where it was dropped on the paper", () => {
    render(editor({ initialContent: seeded({}) }));
    paperSurface(); // 500x500 at the origin: client coords ARE note coords
    const slot = dragTo("⭐", 250, 250);

    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.textContent).toBe("⭐");
    expect(drawn()[0]?.getAttribute("x")).toBe("250");
    expect(drawn()[0]?.getAttribute("y")).toBe("250");
    // the sheet is infinite: the slot is printed again
    expect(slot).not.toHaveAttribute("data-peeled");
    expect(tab()).toHaveAttribute("aria-expanded", "true");
  });

  it("peels the same sticker as many times as it is asked for", () => {
    render(editor({ initialContent: seeded({}) }));
    paperSurface();
    dragTo("🔥", 100, 100);
    dragTo("🔥", 400, 300);

    expect(drawn().map((el) => el.getAttribute("x"))).toEqual(["100", "400"]);
  });

  it("marks the slot bare while its sticker is in flight", () => {
    render(editor({ initialContent: seeded({}) }));
    paperSurface();
    fireEvent.click(tab());
    down(cell("⭐"), 300, 600);

    expect(cell("⭐")).toHaveAttribute("data-peeled");
    expect(drawn()).toHaveLength(0);
  });

  it("sticks nothing when the sticker is let go off the paper", () => {
    render(editor({ initialContent: seeded({}) }));
    paperSurface();
    const slot = dragTo("⭐", 900, 900);

    expect(drawn()).toHaveLength(0);
    wait(FLOWN_HOME); // then the slot is printed again
    expect(slot).not.toHaveAttribute("data-peeled");
  });

  it("lifts nothing off a full note", () => {
    render(
      editor({
        initialContent: seeded({
          elements: Array.from({ length: MAX_ELEMENTS }, () => HI),
        }),
      }),
    );
    paperSurface();
    fireEvent.click(tab());
    down(cell("⭐"), 300, 600);
    expect(cell("⭐")).not.toHaveAttribute("data-peeled");
    upAt(cell("⭐"), 250, 250);

    expect(drawn()).toHaveLength(MAX_ELEMENTS);
  });

  it("refuses a drop that the sticker being placed left no room for", () => {
    render(
      editor({
        initialContent: seeded({
          elements: Array.from({ length: MAX_ELEMENTS - 1 }, () => HI),
        }),
      }),
    );
    paperSurface();
    dragTo("⭐", 250, 250);
    const slot = dragTo("🔥", 300, 300);

    expect(drawn()).toHaveLength(MAX_ELEMENTS);
    expect(drawn().at(-1)?.textContent).toBe("⭐");
    expect(slot).toHaveAttribute("data-peeled"); // on its way home
    wait(FLOWN_HOME);
    expect(slot).not.toHaveAttribute("data-peeled");
  });

  it("keeps the marker in your hand through a peel and a drop", () => {
    render(editor({ initialContent: seeded({}) }));
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

describe("StickyEditor on a tilted note", () => {
  // A tilted paper's box is not the note's frame: a quarter turn puts the
  // note's top edge on the right of the screen, so everything drawn, typed or
  // dropped comes back through that rotation, and a square's stub is 500x500.
  it("lays the sheet down at the angle it is stored with", () => {
    render(editor({ initialContent: seeded({ rotation: -12 }) }));

    expect(paperSurface().style.transform).toContain("rotate(-12deg)");
  });

  it("puts a typed box where the pointer pressed, not where the box is", () => {
    render(editor({ initialContent: seeded({ rotation: 90 }) }));
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const surface = paperSurface();

    // the middle of the screen's right edge: the top of a quarter-turned note
    down(surface, 500, 250);
    up(surface);
    fireEvent.change(screen.getByRole("textbox", { name: /text box/i }), {
      target: { value: "up" },
    });

    expect(drawn()[0]?.getAttribute("x")).toBe("250");
    expect(drawn()[0]?.getAttribute("y")).toBe("0");
  });

  it("sticks a dropped sticker through the same rotation", () => {
    render(editor({ initialContent: seeded({ rotation: 90 }) }));
    paperSurface();
    fireEvent.click(screen.getByRole("button", { name: /the sticker sheet/i }));
    const slot = screen.getByRole("button", { name: "Peel the ⭐ sticker" });
    down(slot, 300, 600);
    move(slot, 500, 250);
    fireEvent.pointerUp(slot, { clientX: 500, clientY: 250, pointerId: 1 });

    expect(drawn()[0]?.getAttribute("x")).toBe("250");
    expect(drawn()[0]?.getAttribute("y")).toBe("0");
  });
});

describe("StickyEditor hand mode", () => {
  // The paper is stubbed 500x500 at the origin, so its centre is (250, 250) and
  // a client point is a note coordinate.
  const tilt = () => paperSurface().style.transform;
  // The two bottom corners as the renderer folded them, off the paper outline:
  // "M 0 0 L 500 0 L 500 <500-br> L <500-br> 500 L <bl> 500 L 0 <500-bl> Z".
  const fold = () => {
    const d = document.querySelector("svg path")?.getAttribute("d") ?? "";
    const [, br = "500", , bl = "0"] =
      d.match(/L 500 ([\d.]+) L ([\d.]+) 500 L ([\d.]+) 500/) ?? [];
    return { br: 500 - Number(br), bl: Number(bl) };
  };

  it("turns the note by the angle a drag sweeps", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    takeHand();
    const surface = paperSurface();

    down(surface, 6, 250); // out by the left edge
    move(surface, 6, 150);
    expect(tilt()).toContain("rotate(22.3deg)");
    up(surface);
    expect(tilt()).toContain("rotate(22.3deg)"); // and it stays turned
  });

  it("holds the tilt to something the wall can wear", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    takeHand();
    const surface = paperSurface();

    down(surface, 6, 250);
    move(surface, 250, 6); // a quarter turn of sweep
    up(surface);

    expect(tilt()).toContain("rotate(25deg)");
  });

  it("draws on the paper instead of turning it when a marker is in hand", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    const surface = paperSurface();

    down(surface, 6, 250);
    move(surface, 6, 150);
    up(surface);

    expect(tilt()).toContain("rotate(0deg)");
    expect(drawn()).toHaveLength(1);
  });

  it("peels a bottom corner further, and back, with a drag", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    takeHand();
    const surface = paperSurface();

    down(surface, 496, 496); // the bottom-right corner
    move(surface, 440, 440);
    const peeled = fold().br;
    expect(peeled).toBeGreaterThan(0);

    move(surface, 480, 480);
    expect(fold().br).toBeLessThan(peeled);
    up(surface);

    expect(fold().bl).toBe(0);
    expect(tilt()).toContain("rotate(0deg)"); // and the corner is not the edge
  });

  it("lifts a corner under a hovering mouse, before it is pressed", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    takeHand();
    const surface = paperSurface();
    const hover = (x: number, y: number) =>
      fireEvent.pointerMove(surface, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
      });

    hover(496, 496);
    expect(document.querySelector('[data-grip="br"]')).not.toBeNull();

    hover(250, 250);
    expect(document.querySelector("[data-grip]")).toBeNull();
  });

  it("turns the note from a press on a placed text box, and leaves the box where it lies", () => {
    render(editor({ initialContent: seeded({ curl: flat, elements: [HI] }) }));
    takeHand();
    const surface = paperSurface();

    down(surface, 60, 80); // on "hi"
    move(surface, 60, 180);
    up(surface);

    // swept from -138.2 to -159.8 degrees about the centre
    expect(tilt()).toContain("rotate(-21.6deg)");
    expect(drawn()[0]?.getAttribute("x")).toBe("40");
    expect(drawn()[0]?.getAttribute("y")).toBe("60");
    expect(placingOutline()).toBeNull();
  });

  it("holds the note still until a drag from near the centre leaves it", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    takeHand();
    const surface = paperSurface();

    down(surface, 250, 220); // 30 above the centre: inside the dead zone
    move(surface, 260, 240); // still inside
    expect(tilt()).toContain("rotate(0deg)");

    move(surface, 300, 250); // out, due right: the angle is read from here
    expect(tilt()).toContain("rotate(0deg)");

    move(surface, 300, 270);
    expect(tilt()).toContain("rotate(21.8deg)");
    up(surface);
  });

  it("opens nothing on a second tap on placed text, and offers no fonts for it", () => {
    render(editor({ initialContent: seeded({ curl: flat, elements: [HI] }) }));
    takeHand();
    const surface = paperSurface();

    down(surface, 60, 80);
    up(surface);
    down(surface, 60, 80);
    up(surface);

    expect(screen.queryByRole("textbox", { name: /text box/i })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /write in/i })).toEqual([]);
    expect(placingOutline()).toBeNull();
    expect(drawn()[0]?.textContent).toBe("hi");
  });
});

describe("StickyEditor two fingers", () => {
  const STAR: NoteElement = {
    type: "sticker",
    x: 250,
    y: 250,
    emoji: "⭐",
    scale: 1,
    rotation: 0,
  };
  const glyph = () => drawn()[0];
  const downAt = (el: HTMLElement, x: number, y: number, pointerId: number) =>
    fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId });
  const upAt = (el: HTMLElement, pointerId: number) =>
    fireEvent.pointerUp(el, { pointerId });

  it("turns the note, not the sticker, with two fingers on a placed sticker", () => {
    render(
      editor({ initialContent: seeded({ curl: flat, elements: [STAR] }) }),
    );
    const surface = paperSurface();

    down(surface, 250, 250); // the first finger on the sticker
    downAt(surface, 300, 250, 2);
    move(surface, 300, 270, 2); // spreads a little and swings round
    upAt(surface, 2);

    expect(paperSurface().style.transform).toContain("rotate(21.8deg)");
    expect(glyph()?.getAttribute("font-size")).toBe("48");
    expect(glyph()?.getAttribute("transform")).toBe("rotate(0 250 250)");
  });

  it("turns the note with two fingers on bare paper", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    const surface = paperSurface();

    down(surface, 250, 250);
    downAt(surface, 300, 250, 2);
    move(surface, 300, 270, 2);
    upAt(surface, 2);

    expect(paperSurface().style.transform).toContain("rotate(21.8deg)");
  });

  it("drops the stroke a second finger lands on, and turns the note instead", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    const surface = paperSurface();

    down(surface, 100, 100);
    move(surface, 140, 160);
    downAt(surface, 300, 300, 2);
    move(surface, 300, 250, 2);
    upAt(surface, 2);
    up(surface);

    expect(drawn()).toHaveLength(0);
    expect(paperSurface().style.transform).toContain("rotate(-11.8deg)");
  });
});

describe("StickyEditor font samples", () => {
  it("closes the font samples on a press anywhere else, without eating it", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const casual = () =>
      screen.queryByRole("button", { name: /write in casual/i });
    expect(casual()).not.toBeNull();
    // no backdrop over the mat: picking a font and placing a box is one tap,
    // not two
    expect(
      screen.queryByRole("button", { name: /close the font samples/i }),
    ).toBeNull();

    fireEvent.pointerDown(document.body);
    expect(casual()).toBeNull();
  });

  it("puts the font samples away on Escape", () => {
    render(editor({ initialContent: seeded({}) }));
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const casual = () =>
      screen.queryByRole("button", { name: /write in casual/i });
    expect(casual()).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(casual()).toBeNull();
  });

  it("leaves the wall's presses and Escape alone once the mat has gone down", () => {
    const content = seeded({ curl: flat });
    const { rerender } = render(editor({ initialContent: content }));
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    rerender(editor({ initialContent: content, up: false }));

    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("button", { name: /write in casual/i }),
    ).not.toBeNull();
  });
});

describe("StickyEditor placing", () => {
  // The paper is 500x500 at the origin, so a handle's 48px reach is 24 units.
  const drag = (
    surface: HTMLElement,
    from: [number, number],
    ...to: [number, number][]
  ) => {
    down(surface, ...from);
    for (const [x, y] of to) move(surface, x, y);
    up(surface);
  };
  const box = () => screen.queryByRole("textbox", { name: /text box/i });
  const openBox = () => {
    pickUp(/pick up the red marker/i);
    pickUp(/write with the marker/i);
    const surface = paperSurface();
    down(surface, 60, 80);
    up(surface);
    return surface;
  };

  it("moves, turns and widens a new text box, then fixes it with a tap that opens nothing", () => {
    const onPinning = vi.fn();
    render(editor({ initialContent: seeded({ curl: flat }), onPinning }));
    const surface = openBox();
    // one empty line: the box is 60..300 x 80..110
    expect(handle("corner")).not.toBeNull();
    expect(handle("width")).not.toBeNull();

    drag(surface, [100, 90], [150, 140]); // its body: now at (110, 130)
    // the width handle, on the right edge at (350, 145): floored, then out
    down(surface, 352, 145);
    move(surface, 0, 145);
    expect(handle("width")?.getAttribute("cx")).toBe(String(110 + 40));
    move(surface, 460, 145);
    up(surface);
    // the corner handle at (460, 160): swung from 4.9 to 85.1 degrees round
    // the box's anchor (110, 130), and never any bigger for it
    drag(surface, [460, 160], [140, 480]);
    expect(box()).toHaveFocus(); // the keyboard stayed up throughout
    fireEvent.change(box() as HTMLElement, { target: { value: "hello" } });

    down(surface, 400, 60);
    up(surface);
    expect(box()).toBeNull();
    expect(placingOutline()).toBeNull();
    expect(pinned(onPinning)).toEqual([
      {
        type: "text",
        x: 110,
        y: 130,
        w: 350,
        text: "hello",
        font: "casual",
        color: "red",
        fontSize: 30,
        rotation: 80.2,
      },
    ]);
  });

  it("changes the open box's font from the rocker's samples, and leaves it open", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    openBox();
    fireEvent.change(box() as HTMLElement, { target: { value: "hi" } });

    press(/write with the marker/i);
    const sample = screen.getByRole("button", {
      name: /write in handwritten/i,
    });
    // a press on the rocker takes no focus off the box: a phone keeps its
    // keyboard up (jsdom never moves focus on a press, so that needs a phone)
    expect(fireEvent.pointerDown(sample)).toBe(false);
    fireEvent.click(sample);

    expect(placingOutline()).not.toBeNull();
    expect(drawn()[0]?.getAttribute("font-family")).toContain("Caveat");
  });

  it("leaves a fixed box alone: a press on it in hand mode turns the note", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    const surface = openBox();
    fireEvent.change(box() as HTMLElement, { target: { value: "hi" } });
    tapAway();
    press(/put down the red marker/i);

    drag(surface, [80, 90], [80, 190]); // on "hi"
    expect(surface.style.transform).not.toContain("rotate(0deg)");
    expect(drawn()[0]?.getAttribute("x")).toBe("60");
    expect(drawn()[0]?.getAttribute("y")).toBe("80");
    expect(box()).toBeNull();
    expect(placingOutline()).toBeNull();
  });

  it.each([
    ["another tool", /pick up the eraser/i],
    ["the hand", /pick up the hand/i],
    ["the rocker's draw half", /draw with the marker/i],
    ["the bin", /bin this note/i],
    ["the sticker tab", /the sticker sheet/i],
  ])("fixes the open box on a press on %s", (_, name) => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    openBox();
    fireEvent.change(box() as HTMLElement, { target: { value: "hi" } });

    press(name);
    expect(box()).toBeNull();
    expect(placingOutline()).toBeNull();
    expect(drawn()[0]?.textContent).toBe("hi");
  });

  // The keyboard's way to the tray: a click with no pointer-down before it.
  it.each([
    ["the bin", /bin this note/i],
    ["a marker", /pick up the black marker/i],
    ["the eraser", /pick up the eraser/i],
    ["the hand", /pick up the hand/i],
    ["the sticker tab", /the sticker sheet/i],
  ])("fixes the open box when the keyboard presses %s", (_, name) => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    openBox();
    fireEvent.change(box() as HTMLElement, { target: { value: "hi" } });

    fireEvent.click(screen.getByRole("button", { name }));
    expect(box()).toBeNull();
    expect(placingOutline()).toBeNull();
    expect(drawn()[0]?.textContent).toBe("hi");
  });

  it("fixes a placing sticker on a press on the rocker's Aa half", () => {
    // "Aa" only spares a text box, which it brings the samples back up for
    render(editor({ initialContent: seeded({ curl: flat }) }));
    paperSurface();
    dragTo("⭐", 250, 250);

    press(/write with the marker/i);
    expect(placingOutline()).toBeNull();
    expect(drawn()[0]?.textContent).toBe("⭐");
  });

  it("fixes a placing sticker on a press on the greyed-out rocker", () => {
    render(editor({ initialContent: seeded({ curl: flat }) }));
    paperSurface();
    dragTo("⭐", 250, 250);

    // hand mode: the rocker is disabled, so there is no click to fix it by
    fireEvent.pointerDown(
      screen.getByRole("button", { name: /draw with the marker/i }),
    );
    expect(placingOutline()).toBeNull();
  });

  it("fixes the open box when the note is pinned up", () => {
    const onPinning = vi.fn();
    render(editor({ initialContent: seeded({ curl: flat }), onPinning }));
    openBox();
    fireEvent.change(box() as HTMLElement, { target: { value: "hi" } });

    expect(pinned(onPinning)).toMatchObject([{ type: "text", text: "hi" }]);
  });

  it("places a dropped sticker: moved, turned by its corner, fixed by a press away that turns nothing", () => {
    const onPinning = vi.fn();
    render(editor({ initialContent: seeded({ curl: flat }), onPinning }));
    const surface = paperSurface();
    dragTo("⭐", 250, 250);
    expect(placingOutline()).not.toBeNull();
    expect(handle("corner")).not.toBeNull();
    expect(handle("width")).toBeNull();

    drag(surface, [250, 250], [200, 220]); // its body
    // the corner handle at (224, 244): a quarter turn round its centre
    drag(surface, [224, 244], [176, 244]);
    drag(surface, [450, 60], [450, 160]);
    expect(surface.style.transform).toContain("rotate(0deg)");
    expect(placingOutline()).toBeNull();
    expect(pinned(onPinning)).toEqual([
      { type: "sticker", x: 200, y: 220, emoji: "⭐", scale: 1, rotation: 90 },
    ]);
  });

  it("sends a placing sticker back to the sheet on Escape, and keeps the sheet up", () => {
    const onPinning = vi.fn();
    render(editor({ initialContent: seeded({ curl: flat }), onPinning }));
    paperSurface();
    dragTo("⭐", 250, 250);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(placingOutline()).toBeNull();
    expect(drawn()).toHaveLength(0);
    expect(tab()).toHaveAttribute("aria-expanded", "true");
    expect(pinned(onPinning)).toEqual([]);
  });

  it("sends a placing sticker back to the sheet when it is dragged off the paper", () => {
    const onPinning = vi.fn();
    render(editor({ initialContent: seeded({ curl: flat }), onPinning }));
    const surface = paperSurface();
    dragTo("⭐", 250, 250);

    drag(surface, [250, 250], [-40, 250]); // 24 wide a side: wholly off
    expect(placingOutline()).toBeNull();
    expect(drawn()).toHaveLength(0);
    expect(pinned(onPinning)).toEqual([]);
  });

  it("fixes a placing sticker when the next one is peeled", () => {
    const onPinning = vi.fn();
    render(editor({ initialContent: seeded({ curl: flat }), onPinning }));
    paperSurface();
    dragTo("⭐", 100, 100);

    down(cell("🔥"), 300, 600);
    expect(placingOutline()).toBeNull();
    expect(drawn().map((el) => el.textContent)).toEqual(["⭐"]);
    move(cell("🔥"), 400, 300);
    fireEvent.pointerUp(cell("🔥"), {
      clientX: 400,
      clientY: 300,
      pointerId: 1,
    });

    // the flame is the one being placed now: its box starts 24 left of 400
    expect(placingOutline()?.getAttribute("x")).toBe("376");
    expect(pinned(onPinning)).toMatchObject([
      { emoji: "⭐", x: 100 },
      { emoji: "🔥", x: 400 },
    ]);
  });
});
