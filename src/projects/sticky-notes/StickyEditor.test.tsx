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
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

const stack = () => screen.getByRole("button", { name: /fan out the pads/i });
// the only buttons naming a colour are the pads
const pad = (colour: string) =>
  screen.getByRole("button", { name: new RegExp(colour, "i") });
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
