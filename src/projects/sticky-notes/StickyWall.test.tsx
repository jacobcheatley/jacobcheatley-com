import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { noteContent } from "./note-fixture";
import type { Font, NoteContent } from "./note-schema";
import { type PendingNote, readPending, savePending } from "./pending-note";
import { StickyWall } from "./StickyWall";

vi.mock("./note-fonts", async (orig) => ({
  ...(await orig<typeof import("./note-fonts")>()),
  loadFont: vi.fn(() => Promise.resolve()),
}));

// TanStack's <Link> needs a router context we don't want to build here; the
// invite note renders as a plain anchor for this seam.
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

const note = (id: number, author: string, over?: Partial<NoteContent>) => ({
  id,
  author,
  content: noteContent(over),
});

const pending = (author: string, at: number): PendingNote => ({
  author,
  content: noteContent(),
  submittedAtMs: at,
});

// savePending prepends, so the oldest goes in first
const storePending = (...newestFirst: PendingNote[]) => {
  for (const note of [...newestFirst].reverse()) savePending(note);
};

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

  it("wears no header — only a hidden heading for the document outline", () => {
    render(<StickyWall notes={[]} />);
    expect(screen.getByRole("heading", { name: "Sticky Notes" })).toHaveClass(
      "sr-only",
    );
    expect(screen.queryByRole("link", { name: /jacobcheatley/i })).toBeNull();
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

  it("opens the zoom Spotlight on tap and closes it on Escape", async () => {
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

  it("closes the Spotlight on tap-out (the scrim)", async () => {
    const user = userEvent.setup();
    render(<StickyWall notes={[note(1, "sam")]} />);
    await user.click(screen.getByRole("button", { name: /zoom note by sam/i }));
    await screen.findByRole("dialog");

    // two "Close note" buttons: the full-bleed scrim and the × — either closes
    const [scrim] = screen.getAllByRole("button", { name: /close note/i });
    await user.click(scrim as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows every stored pending note at the newest slots, marked pending", async () => {
    // stored newest-first, as savePending writes them
    storePending(pending("ada", 2), pending("lee", 1));

    render(<StickyWall notes={[note(1, "sam")]} />);

    // the pending overlay is applied after mount
    await waitFor(() => {
      const tiles = screen.getAllByRole("button", { name: /zoom note by/i });
      expect(tiles).toHaveLength(3);
      expect(tiles[0]).toHaveAccessibleName(/ada/i);
      expect(tiles[1]).toHaveAccessibleName(/lee/i);
    });
    expect(screen.getAllByText(/pending/i)).toHaveLength(2);
  });

  it("puts nothing in the newest slot while a note is being pinned up", async () => {
    storePending(pending("ada", 2));
    const notes = [note(1, "sam")];
    const { rerender } = render(<StickyWall notes={notes} />);
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(3),
    );

    rerender(
      <StickyWall notes={notes} pinning={noteContent({ colour: "pink" })} />,
    );

    // invite, the pending note, the approved one; the note being pinned up is
    // in the Spotlight over the top, not on the board
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toContainElement(
      screen.getByRole("link", { name: /pin a note/i }),
    );
    expect(items[1]).toContainElement(
      screen.getByRole("button", { name: /zoom note by ada/i }),
    );
  });

  it("marks the newest pending tile as the slot a note flies home into", async () => {
    storePending(pending("ada", 2), pending("lee", 1));
    render(<StickyWall notes={[note(1, "sam")]} />);

    await waitFor(() =>
      expect(document.querySelectorAll("[data-newest]")).toHaveLength(1),
    );
    expect(document.querySelector("[data-newest]")).toContainElement(
      screen.getByRole("button", { name: /zoom note by ada/i }),
    );
  });

  it("keeps the small invite, not the empty wall's, while a note is pinned up over it", () => {
    render(<StickyWall notes={[]} pinning={noteContent()} />);
    // "+ pin" is the tile-sized invite; the empty wall's asks for the first note
    expect(screen.getByRole("link", { name: /pin a note/i })).toHaveTextContent(
      "+ pin",
    );
  });

  it("shows the note just sent as pending once the pinning has ended", () => {
    // the same list both times: nothing but the pinning going re-reads it
    const notes = [note(1, "sam")];
    const { rerender } = render(
      <StickyWall notes={notes} pinning={noteContent()} />,
    );
    // the submit writes the pending list, then the Spotlight goes
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
      <StickyWall notes={[{ id: 9, author: "ada", content: noteContent() }]} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/pending/i)).toHaveLength(1);
    });
    const tiles = screen.getAllByRole("button", { name: /zoom note by/i });
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAccessibleName(/lee/i);
    expect(readPending()).toEqual([pending("lee", 1)]);
  });
});

describe("StickyWall fonts", () => {
  it("loads every font its notes use on mount, not just when the editor opens", async () => {
    const { loadFont } = await import("./note-fonts");
    const text = (font: Font) => ({
      type: "text" as const,
      x: 0,
      y: 0,
      w: 400,
      text: "hi",
      font,
      color: "black" as const,
      fontSize: 24,
      rotation: 0,
    });
    storePending({
      author: "pat",
      submittedAtMs: 1,
      content: noteContent({ elements: [text("marker")] }),
    });
    render(
      <StickyWall
        notes={[note(1, "sam", { elements: [text("handwritten")] })]}
      />,
    );
    await waitFor(() => {
      // the invite note is always casual; the tiles bring their own
      expect(loadFont).toHaveBeenCalledWith("casual");
      expect(loadFont).toHaveBeenCalledWith("handwritten");
      expect(loadFont).toHaveBeenCalledWith("marker");
    });
  });
});
