import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type Element, emptyNote } from "./note-editor";
import type { NoteContent } from "./note-schema";
import StickyEditor from "./StickyEditor";

// The desk island (#73). No tools yet — markers, eraser and stickers land in
// T4/T5 — so on this mat a note can only be born at the pad stack and only die
// in the bin. Motion is CSS; these tests assert the state a transition carries,
// never the transition itself.

// exact, not a regex: the fan's backdrop is also named "…pad stack"
const stack = () => screen.getByRole("button", { name: "pad stack" });
const pad = (colour: string) =>
  screen.getByRole("button", { name: new RegExp(`${colour} pad`, "i") });
const bin = () => screen.getByRole("button", { name: /bin the note/i });
const note = () => screen.queryByRole("img", { name: /sticky note/i });
const paper = () =>
  note()?.closest("[data-colour]")?.getAttribute("data-colour");

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
    fireEvent.click(stack());

    expect(pad("blue")).toBeEnabled();
    expect(note()).toBeNull();
    // the stack itself is no longer the target — the six pads are
    expect(screen.queryByRole("button", { name: "pad stack" })).toBeNull();
  });

  it("tears a sheet off a fanned pad and closes the stack", () => {
    render(<StickyEditor />);
    fireEvent.click(stack());
    fireEvent.click(pad("blue"));

    expect(paper()).toBe("blue");
    expect(pad("blue")).toBeDisabled();
  });

  it("swaps the paper under the content when another pad is tapped", () => {
    render(
      <StickyEditor
        initialContent={seeded({ colour: "yellow", elements: [HI] })}
      />,
    );
    fireEvent.click(stack());
    fireEvent.click(pad("pink"));

    expect(paper()).toBe("pink");
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("closes the fan on a tap anywhere else", () => {
    render(<StickyEditor />);
    fireEvent.click(stack());
    fireEvent.click(
      screen.getByRole("button", { name: /close the pad stack/i }),
    );

    expect(pad("blue")).toBeDisabled();
    expect(note()).toBeNull();
  });

  it("crumples the note into the bin and tears a fresh sheet of the same colour", () => {
    vi.useFakeTimers();
    try {
      render(
        <StickyEditor
          initialContent={seeded({ colour: "pink", elements: [HI] })}
        />,
      );
      fireEvent.click(bin());
      act(() => void vi.advanceTimersByTime(1000));

      expect(paper()).toBe("pink");
      expect(screen.queryByText("hi")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
