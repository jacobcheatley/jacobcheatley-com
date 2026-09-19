import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { NoteContent } from "./note-schema";
import { Spotlight } from "./Spotlight";

const content: NoteContent = {
  version: 1,
  w: 500,
  h: 500,
  colour: "yellow",
  rotation: 0,
  curl: { bl: 0, br: 0 },
  fastener: "none",
  elements: [],
};

const note = () => document.querySelector("[data-spotlight]") as HTMLElement;

describe("Spotlight", () => {
  it("lifts the note out of the wall in a labelled dialog", () => {
    render(<Spotlight content={content} label="Note by sam" />);

    const dialog = screen.getByRole("dialog", { name: "Note by sam" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(note());
    expect(note().querySelector("svg")).toBeInTheDocument();
  });

  it("hangs the children beneath the note", () => {
    render(
      <Spotlight content={content} label="Note by sam">
        <p>— sam</p>
      </Spotlight>,
    );

    const caption = screen.getByText("— sam");
    expect(note().compareDocumentPosition(caption)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("closes on the scrim and on the × when there is a way back", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Spotlight content={content} label="Note by sam" onClose={onClose} />,
    );

    // the scrim and the × share the label; the scrim is the first of the two
    const [scrim, close] = screen.getAllByRole("button", {
      name: /close note/i,
    });
    expect(close).toHaveFocus();

    await user.click(scrim as HTMLElement);
    await user.click(close as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("presses the fastener on again each time one is chosen", () => {
    const { rerender } = render(
      <Spotlight content={content} label="Pin it up" />,
    );
    // the note arrives unfastened, and arriving is not a press
    expect(note().querySelector("[data-press]")).toBeNull();

    const pinned = { ...content, fastener: "pin-red" } as NoteContent;
    rerender(<Spotlight content={pinned} label="Pin it up" />);
    const first = note().querySelector("[data-press]");
    expect(first).toHaveAttribute("data-press", "pin-red");

    // pinning hands over a new note each choice, even of the same fastener
    rerender(<Spotlight content={{ ...pinned }} label="Pin it up" />);
    const again = note().querySelector("[data-press]");
    expect(again).toHaveAttribute("data-press", "pin-red");
    // a fresh node, so its CSS animation starts over
    expect(again).not.toBe(first);
  });

  it("offers no way out when the caller provides its own", () => {
    render(<Spotlight content={content} label="Pinning a note" />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
