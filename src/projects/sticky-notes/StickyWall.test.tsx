import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteContent } from "./note-schema";
import type { PendingNote } from "./pending-note";
import { StickyWall } from "./StickyWall";

// TanStack's <Link> needs a router context we don't want to build here; the back
// link renders as a plain anchor for this seam.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: React.PropsWithChildren<{ to?: string }>) => (
    <a href={to}>{children}</a>
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

  it("shows a stored pending note at the newest slot, marked pending", async () => {
    const pending: PendingNote = {
      author: "ada",
      content: content(),
      submittedAt: 1,
    };
    localStorage.setItem("sticky-notes:pending", JSON.stringify(pending));

    render(<StickyWall notes={[note(1, "sam")]} />);

    // pending overlay is applied after mount; it lands first (newest slot)
    await waitFor(() => {
      const tiles = screen.getAllByRole("button", { name: /zoom note by/i });
      expect(tiles).toHaveLength(2);
      expect(tiles[0]).toHaveAccessibleName(/ada/i);
    });
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("reconciles a pending note away once it appears approved", async () => {
    const pending: PendingNote = {
      author: "ada",
      content: content(),
      submittedAt: 1,
    };
    localStorage.setItem("sticky-notes:pending", JSON.stringify(pending));

    // the same note is now in the approved list (same author + content)
    render(
      <StickyWall notes={[{ id: 9, author: "ada", content: content() }]} />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/pending/i)).toBeNull();
    });
    // only the one approved tile, and localStorage was cleared
    expect(
      screen.getAllByRole("button", { name: /zoom note by/i }),
    ).toHaveLength(1);
    expect(localStorage.getItem("sticky-notes:pending")).toBeNull();
  });
});
