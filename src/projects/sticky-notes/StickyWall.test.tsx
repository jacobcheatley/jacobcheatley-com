import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteContent } from "./note-schema";
import type { PendingNote } from "./pending-note";
import { StickyWall } from "./StickyWall";

// TanStack's <Link> needs a router context we don't want to build here; the back
// link renders as a plain anchor for this seam.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: React.ComponentProps<"a"> & { to?: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

function content(over?: Partial<NoteContent>): NoteContent {
  return {
    version: 1,
    w: 500,
    h: 500,
    colour: "yellow",
    rotation: 0,
    curl: { bl: 0, br: 0 },
    fastener: "none",
    elements: [],
    ...over,
  };
}

const note = (id: number, author: string, over?: Partial<NoteContent>) => ({
  id,
  author,
  content: content(over),
});

const pending = (author: string, at: number): PendingNote => ({
  author,
  content: content(),
  submittedAt: at,
});

const storePending = (...list: PendingNote[]) =>
  localStorage.setItem("sticky-notes:pending", JSON.stringify(list));

afterEach(() => {
  localStorage.clear();
});

describe("StickyWall", () => {
  it("renders a tile per approved note, newest-first order preserved", () => {
    render(<StickyWall notes={[note(2, "sam"), note(1, "lee")]} />);
    const tiles = screen.getAllByRole("button", { name: /zoom note by/i });
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAccessibleName(/sam/i);
    expect(tiles[1]).toHaveAccessibleName(/lee/i);
  });

  it("shows the diegetic add affordance and no note tiles when there are none", () => {
    render(<StickyWall notes={[]} />);
    expect(screen.queryByRole("button", { name: /zoom note/i })).toBeNull();
    const add = screen.getByRole("link", { name: /pin a note/i });
    expect(add).toHaveAttribute("href", "/sticky-notes/new");
  });

  it("keeps the add affordance first once notes exist (newest-first)", () => {
    render(<StickyWall notes={[note(1, "sam")]} />);
    const add = screen.getByRole("link", { name: /pin a note/i });
    expect(add).toHaveAttribute("href", "/sticky-notes/new");
    // the add link precedes the first note tile in DOM order
    const tile = screen.getByRole("button", { name: /zoom note by sam/i });
    expect(add.compareDocumentPosition(tile)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("opens a zoom lightbox on tap and closes it on Escape", async () => {
    const user = userEvent.setup();
    render(<StickyWall notes={[note(1, "sam")]} />);
    await user.click(screen.getByRole("button", { name: /zoom note by sam/i }));

    const dialog = await screen.findByRole("dialog", { name: /note by sam/i });
    expect(dialog).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes the lightbox on tap-out (backdrop)", async () => {
    const user = userEvent.setup();
    render(<StickyWall notes={[note(1, "sam")]} />);
    await user.click(screen.getByRole("button", { name: /zoom note by sam/i }));
    await screen.findByRole("dialog");

    // two "Close note" buttons: the full-bleed backdrop and the × — either closes
    const [backdrop] = screen.getAllByRole("button", { name: /close note/i });
    await user.click(backdrop as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows every stored pending note at the newest slots, marked pending", async () => {
    // stored newest-first, as savePending writes them
    storePending(pending("ada", 2), pending("lee", 1));

    render(<StickyWall notes={[note(1, "sam")]} />);

    // pending overlay is applied after mount; both land ahead of the approved one
    await waitFor(() => {
      const tiles = screen.getAllByRole("button", { name: /zoom note by/i });
      expect(tiles).toHaveLength(3);
      expect(tiles[0]).toHaveAccessibleName(/ada/i);
      expect(tiles[1]).toHaveAccessibleName(/lee/i);
    });
    expect(screen.getAllByText(/pending/i)).toHaveLength(2);
  });

  it("lands a pinned note in the newest slot, right after the invite, marked pending", async () => {
    storePending(pending("ada", 2));
    // the wall is up before anything lands on it
    const notes = [note(1, "sam")];
    const { rerender } = render(<StickyWall notes={notes} />);
    rerender(
      <StickyWall notes={notes} landing={content({ colour: "pink" })} />,
    );

    // invite, then the landed note, then the pending and approved ones
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(4),
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toContainElement(
      screen.getByRole("link", { name: /pin a note/i }),
    );
    expect(items[1]).toHaveAttribute("data-landing");
    expect(items[1]).toHaveTextContent(/pending/i);
    expect(items[2]).toContainElement(
      screen.getByRole("button", { name: /zoom note by ada/i }),
    );
  });

  it("presses the fastener on again when the same one is chosen again", () => {
    const { rerender } = render(
      <StickyWall notes={[]} landing={content({ fastener: "pin-red" })} />,
    );
    const first = document.querySelector("[data-press]");
    // the drawer hands over a new note each choice, even of the same fastener
    rerender(
      <StickyWall notes={[]} landing={content({ fastener: "pin-red" })} />,
    );

    const again = document.querySelector("[data-press]");
    expect(again).toHaveAttribute("data-press", "pin-red");
    // a fresh node, so its CSS animation starts over
    expect(again).not.toBe(first);
  });

  it("keeps the invite tile-sized while a note lands on an empty wall", () => {
    render(<StickyWall notes={[]} landing={content()} />);
    expect(screen.getByRole("link", { name: /pin a note/i })).toHaveClass(
      "w-32",
    );
  });

  it("shows the note that just landed as pending once it has been submitted", () => {
    // the same list both times: nothing but the landing going re-reads it
    const notes = [note(1, "sam")];
    const { rerender } = render(
      <StickyWall notes={notes} landing={content()} />,
    );
    // the submit writes the pending list, then the landed note goes
    storePending(pending("ada", 2));
    rerender(<StickyWall notes={notes} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toContainElement(
      screen.getByRole("button", { name: /zoom note by ada/i }),
    );
  });

  it("reconciles away only the pending note that got approved", async () => {
    storePending(pending("ada", 2), pending("lee", 1));

    // ada's note is now in the approved list (same author + content)
    render(
      <StickyWall notes={[{ id: 9, author: "ada", content: content() }]} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/pending/i)).toHaveLength(1);
    });
    // ada's approved tile plus lee's still-pending one
    const tiles = screen.getAllByRole("button", { name: /zoom note by/i });
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAccessibleName(/lee/i);
    // the trimmed list is written back
    expect(localStorage.getItem("sticky-notes:pending")).toBe(
      JSON.stringify([pending("lee", 1)]),
    );
  });
});
