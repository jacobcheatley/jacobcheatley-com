import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ShownElement } from "./showdown-stats";
import { Tug } from "./Tug";

const fire: ShownElement = {
  id: 1,
  name: "fire",
  emoji: "🔥",
  colour: "#f2541b",
};
const water: ShownElement = {
  id: 2,
  name: "water",
  emoji: "💧",
  colour: "#2f7fe0",
};

function aTug() {
  const onCast = vi.fn();
  render(
    <Tug
      top={fire}
      bottom={water}
      isFirstMatchup
      onCast={onCast}
      limited={null}
      reveal={null}
      onAdvance={vi.fn()}
    />,
  );
  return onCast;
}

const pill = () => screen.getByRole("button");
const slider = () => screen.getByRole("slider");

// A gesture as a browser sends it: the slider captures the pointer, so the
// moves and the release reach it wherever the finger went down, and the click
// that follows a tap carries the count of a real press.
const pressOn = (element: HTMLElement, clientY: number) =>
  fireEvent.pointerDown(element, { pointerId: 1, clientY });
const moveTo = (clientY: number) =>
  fireEvent.pointerMove(slider(), { pointerId: 1, clientY });
const release = (clientY: number) =>
  fireEvent.pointerUp(slider(), { pointerId: 1, clientY });
const clickFromPointer = () => fireEvent.click(pill(), { detail: 1 });

// Past the strong-win reach, which the seam's own tests pin in pixels.
const STRONG_WIN_DRAG_PX = 120;

describe("a gesture that starts on the pill", () => {
  it("casts the Vote it dragged the seam to", () => {
    const onCast = aTug();

    pressOn(pill(), 400);
    moveTo(400 + STRONG_WIN_DRAG_PX);
    release(400 + STRONG_WIN_DRAG_PX);
    clickFromPointer();

    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledWith(2);
  });

  it("casts too close to call once for a tap with the seam at rest", () => {
    const onCast = aTug();

    pressOn(pill(), 400);
    release(400);
    clickFromPointer();

    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledWith(0);
  });

  it("casts nothing when the drag comes back to the middle", () => {
    const onCast = aTug();

    pressOn(pill(), 400);
    moveTo(400 + STRONG_WIN_DRAG_PX);
    moveTo(400);
    release(400);
    clickFromPointer();

    expect(onCast).not.toHaveBeenCalled();
  });
});

describe("the pill on its own", () => {
  it("casts too close to call for an activation with no pointer behind it", () => {
    const onCast = aTug();

    fireEvent.click(pill());

    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledWith(0);
  });
});
