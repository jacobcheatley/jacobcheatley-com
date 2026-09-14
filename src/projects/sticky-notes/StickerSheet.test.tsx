import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StickerSheet } from "./StickerSheet";

// The sheet on its own (#75): the peel gesture, and nothing about the note.
// Where a sticker lands is `onDrop`'s answer, which is the editor's job and is
// tested against the real paper in StickyEditor.test.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

const cell = (emoji: string) =>
  screen.getByRole("button", { name: `Peel the ${emoji} sticker` });
const handle = () =>
  document.querySelector<HTMLElement>('[data-slot="sheet-handle"]') as
    | HTMLElement
    | undefined;
const flying = () => screen.queryByText("⭐", { ignore: "button *" });
// the dog-ear at the sheet's top right, one of its three ways down
const corner = () =>
  screen.queryByRole("button", { name: "Close the sticker sheet" });

const down = (el: HTMLElement, x: number, y: number, pointerId = 1) =>
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId });
const move = (el: HTMLElement, x: number, y: number, pointerId = 1) =>
  fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId });
const up = (el: HTMLElement, x: number, y: number, pointerId = 1) =>
  fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId });

function sheet(over: Partial<Parameters<typeof StickerSheet>[0]> = {}) {
  const onDrop = vi.fn(() => true);
  const onClose = vi.fn();
  const props = { open: true, canPeel: true, onDrop, onClose, ...over };
  const view = render(<StickerSheet {...props} />);
  return {
    onDrop,
    onClose,
    open: (next: boolean) =>
      view.rerender(<StickerSheet {...props} open={next} />),
  };
}

describe("StickerSheet", () => {
  it("prints one flat grey behind every sticker", () => {
    sheet();
    // the T0 verdict (#70): a printed backing, not a greyscale of the emoji
    const backing = cell("⭐").firstElementChild as HTMLElement;

    expect(backing.textContent).toBe("⭐");
    expect(backing.style.color).toBe("transparent");
    expect(backing.style.textShadow).toMatch(/^1px 1px 0 \S+$/); // one value
    expect(backing.style.filter).toBe("");
  });

  it("carries a peeled sticker under the pointer and hands the drop on", () => {
    const { onDrop } = sheet();
    down(cell("⭐"), 20, 300);
    expect(flying()).toBeInTheDocument();
    expect(cell("⭐")).toHaveAttribute("data-peeled");

    move(cell("⭐"), 180, 260);
    up(cell("⭐"), 180, 260);

    expect(onDrop).toHaveBeenCalledWith("⭐", 180, 260);
    expect(flying()).toBeNull();
    expect(cell("⭐")).not.toHaveAttribute("data-peeled");
  });

  it("flies a refused sticker home before reprinting its slot", () => {
    sheet({ onDrop: () => false });
    down(cell("⭐"), 20, 300);
    up(cell("⭐"), 900, 900);

    // still on its way back, so the slot stays bare until it lands
    expect(cell("⭐")).toHaveAttribute("data-peeled");
    wait(300);
    expect(flying()).toBeNull();
    expect(cell("⭐")).not.toHaveAttribute("data-peeled");
  });

  it("treats a cancelled pointer as a miss, not a drop", () => {
    const { onDrop } = sheet();
    down(cell("⭐"), 20, 300);
    fireEvent.pointerCancel(cell("⭐"), {
      clientX: 180,
      clientY: 260,
      pointerId: 1,
    });
    wait(300);

    expect(onDrop).not.toHaveBeenCalled();
    expect(cell("⭐")).not.toHaveAttribute("data-peeled");
  });

  it("peels one sticker at a time", () => {
    const { onDrop } = sheet();
    down(cell("⭐"), 20, 300);
    down(cell("🔥"), 60, 300, 2); // a second finger on the sheet

    expect(cell("🔥")).not.toHaveAttribute("data-peeled");
    up(cell("⭐"), 180, 260, 2); // and it cannot end the first one either
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("lifts nothing while peeling is refused", () => {
    const { onDrop } = sheet({ canPeel: false });
    down(cell("⭐"), 20, 300);
    expect(cell("⭐")).not.toHaveAttribute("data-peeled");
    expect(flying()).toBeNull();

    up(cell("⭐"), 180, 260);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("puts a closed sheet out of reach entirely", () => {
    const { open } = sheet({ open: false });
    const parked = () => document.querySelector('[data-slot="sheet"]');

    // parked below the mat's edge: inert keeps it out of the tab order, the
    // screen-reader tree and the pointer's way at once
    expect(parked()).toHaveAttribute("inert");
    open(true);
    expect(parked()).not.toHaveAttribute("inert");
  });

  it("keeps the cells out of the tab order: a sticker is dragged, not tabbed to", () => {
    sheet();
    expect(cell("\u2b50")).toHaveAttribute("tabindex", "-1");
    // and still named, for touch exploration and for reading the page
    expect(cell("\u2b50")).toHaveAccessibleName("Peel the \u2b50 sticker");
  });

  it("puts the sheet away on a swipe down its handle", () => {
    const { onClose } = sheet();
    const grip = handle() as HTMLElement;

    down(grip, 160, 400);
    move(grip, 160, 420); // a short drag is not a swipe
    expect(onClose).not.toHaveBeenCalled();

    move(grip, 160, 460);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("puts the sheet away on its folded corner", () => {
    const { onClose } = sheet();
    fireEvent.click(corner() as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("turns the corner up only while the sheet is up", () => {
    const { open } = sheet({ open: false });
    expect(corner()).toBeNull(); // nothing to close a sheet that is away

    open(true);
    expect(corner()).toBeInTheDocument();
  });
});
