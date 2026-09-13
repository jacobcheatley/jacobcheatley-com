import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteContent } from "./note-schema";
import { StickyNotes } from "./StickyNotes";

// The whole page (#77): the wall, the mat over it, and pinning a note up from
// one onto the other. The route's only contribution is `matUp` (whether the URL
// is /sticky-notes/new), so the tests drive that prop the way Back and the
// invite drive the URL. Motion is CSS and FLIP; these assert the state it
// carries, never the flight.

// The router and the write server fn don't belong in jsdom: stub them at the
// seams, as the phase-1 editor tests did. The note and its contract run for
// real. The factories read these lazily, so declaring them below is fine.
const navigate = vi.fn();
const addNote = vi.fn();

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
  useNavigate: () => navigate,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => addNote }));
vi.mock("./sticky-notes.fn", () => ({ addNoteFn: {} }));

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

const approved = (author: string) => ({
  id: 1,
  author,
  content: {
    version: 1,
    w: 500,
    h: 500,
    colour: "white",
    rotation: 0,
    curl: { bl: 0, br: 0 },
    fastener: "none",
    elements: [],
  } satisfies NoteContent,
});

// The mat is the surface the "← the wall" link is stuck to.
const mat = () =>
  screen.getByRole("link", { name: /the wall/i }).parentElement as HTMLElement;
const landed = () => document.querySelector<HTMLElement>("[data-landing]");
// the sheet lying on the mat, as opposed to any note on the wall
const matPaper = () => document.querySelector<HTMLElement>("[data-colour]");
const pinItUp = () =>
  fireEvent.click(screen.getByRole("button", { name: /pin it up/i }));

// The island is lazy, so wait for it on the real clock; then take the clock,
// because the fan only answers a tap once it has settled — and give it back
// once the sheet is down, since the submit waits on a promise.
async function tearOff(colour = "yellow") {
  await screen.findByRole("button", { name: /fan out the pads/i });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /fan out the pads/i }));
  wait(300);
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`${colour} sheet`, "i") }),
  );
  wait(300);
  vi.useRealTimers();
}

beforeEach(() => {
  // jsdom has no scrolling, and says so loudly
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  navigate.mockReset();
  addNote.mockReset().mockResolvedValue({ status: "pending" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("StickyNotes pin it up", () => {
  it("offers nothing to pin until a sheet is on the mat", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await screen.findByRole("button", { name: /fan out the pads/i });
    expect(screen.queryByRole("button", { name: /pin it up/i })).toBeNull();
  });

  it("slides the mat down and lands the note on the wall, at the top of the page", async () => {
    render(<StickyNotes notes={[approved("sam")]} matUp />);
    await tearOff();
    expect(landed()).toBeNull();

    pinItUp();

    expect(mat()).toHaveStyle({ transform: "translateY(100%)" });
    const note = landed();
    expect(note).not.toBeNull();
    expect(
      within(note as HTMLElement).getByRole("img", { name: /sticky note/i }),
    ).toBeInTheDocument();
    // the wall is live again under the note
    expect(note?.closest("[inert]")).toBeNull();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    // it flew off the mat: there is no second copy of it left lying there
    expect(matPaper()).not.toBeVisible();
  });
});

const drawer = () => screen.getByRole("region", { name: /fastener drawer/i });
const drawerTab = () =>
  screen.queryByRole("button", { name: /open the fastener drawer/i });
// what the landed note is fastened with, as the wall wears it
const fastenedWith = () =>
  landed()?.querySelector("[data-press]")?.getAttribute("data-press") ?? "none";

describe("StickyNotes fastener drawer", () => {
  async function pinned() {
    render(<StickyNotes notes={[]} matUp />);
    await tearOff();
    pinItUp();
  }

  it("rises over the wall with the nine fasteners in it", async () => {
    await pinned();
    expect(drawer()).not.toHaveAttribute("inert");
    expect(
      within(drawer()).getAllByRole("button", { name: /^fasten it with/i }),
    ).toHaveLength(9);
    expect(drawerTab()).toBeNull();
  });

  it("fastens the landed note with the one chosen, and folds away to a tab", async () => {
    await pinned();
    fireEvent.click(screen.getByRole("button", { name: /with a red pin/i }));

    expect(fastenedWith()).toBe("pin-red");
    expect(drawer()).toHaveAttribute("inert");
    expect(drawerTab()).toBeInTheDocument();
  });

  it("opens again from its tab, and takes another choice", async () => {
    await pinned();
    fireEvent.click(screen.getByRole("button", { name: /with a red pin/i }));
    fireEvent.click(drawerTab() as HTMLElement);

    expect(drawer()).not.toHaveAttribute("inert");
    expect(drawerTab()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /with two staples/i }));
    expect(fastenedWith()).toBe("staples");
  });

  it("leaves the note with no fastener when put away without a choice", async () => {
    await pinned();
    fireEvent.click(
      screen.getByRole("button", { name: /put the drawer away/i }),
    );

    expect(fastenedWith()).toBe("none");
    expect(drawer()).toHaveAttribute("inert");
    expect(drawerTab()).toBeInTheDocument();
  });
});

const nameTag = () => screen.queryByRole("textbox", { name: /your name/i });
const tick = () => screen.getByRole("button", { name: /sign the tag/i });
// what the one POST carried
const posted = () => addNote.mock.calls[0]?.[0]?.data;

describe("StickyNotes tag", () => {
  // pinned up and fastened with a red pin, so the tag is out
  async function fastened() {
    render(<StickyNotes notes={[]} matUp />);
    await tearOff();
    pinItUp();
    fireEvent.click(screen.getByRole("button", { name: /with a red pin/i }));
  }

  it("hangs a name tag under the landed note once the drawer folds away", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await tearOff();
    pinItUp();
    expect(nameTag()).toBeNull(); // the drawer is still up

    fireEvent.click(
      screen.getByRole("button", { name: /put the drawer away/i }),
    );
    const input = nameTag();
    expect(landed()).toContainElement(input);
    // a name, not a sentence: no browser second-guessing what is typed
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("maxlength", "50");
    expect(input).toHaveAttribute("placeholder", "your name");
    expect(input).toHaveClass("lowercase");
  });

  it("keeps what was typed on the tag while the drawer is open again", async () => {
    const user = userEvent.setup();
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada");
    fireEvent.click(drawerTab() as HTMLElement);
    fireEvent.click(
      screen.getByRole("button", { name: /put the drawer away/i }),
    );

    expect(nameTag()).toHaveValue("ada");
  });

  it("pins the note up under the name on Enter, lowercased, fastener and all", async () => {
    const user = userEvent.setup();
    await fastened();
    await user.type(nameTag() as HTMLElement, "  Ada {Enter}");

    await waitFor(() => expect(addNote).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({
      author: "ada",
      content: { colour: "yellow", fastener: "pin-red" },
    });
  });

  it("pins it up from the tick on the tag too, for a thumb", async () => {
    const user = userEvent.setup();
    await fastened();
    await user.type(nameTag() as HTMLElement, "lee");
    await user.click(tick());

    await waitFor(() => expect(addNote).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ author: "lee" });
  });

  it("shakes a tag with no name on it, and posts nothing", async () => {
    const user = userEvent.setup();
    await fastened();
    await user.type(nameTag() as HTMLElement, "   ");
    await user.click(tick());

    expect(nameTag()?.closest("form")).toHaveAttribute("data-shake");
    expect(addNote).not.toHaveBeenCalled();
  });
});

const storedPending = () =>
  JSON.parse(localStorage.getItem("sticky-notes:pending") ?? "[]");
// the submit's navigation, as the router would be asked for it
const backToTheWall = { to: "/sticky-notes", replace: true };

// With the mat up: tear a sheet off, pin it up and fasten it with a red pin.
async function pinAndFasten() {
  await tearOff();
  pinItUp();
  fireEvent.click(screen.getByRole("button", { name: /with a red pin/i }));
}

describe("StickyNotes submit", () => {
  it("keeps the note as pending and goes back to the wall in place of the editor's URL", async () => {
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await pinAndFasten();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(backToTheWall));
    expect(storedPending()).toMatchObject([
      { author: "ada", content: { fastener: "pin-red" } },
    ]);
  });

  it("posts once, however often the tag is signed while the note is on its way", async () => {
    let arrive: () => void = () => {};
    addNote.mockReturnValue(
      new Promise((resolve) => {
        arrive = () => resolve({ status: "pending" });
      }),
    );
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await pinAndFasten();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");
    await user.click(tick());
    await user.type(nameTag() as HTMLElement, "{Enter}");

    expect(addNote).toHaveBeenCalledTimes(1);
    await act(async () => arrive());
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  });

  it("says so on the tag when the post fails, leaves the note where it landed, and lets it go again", async () => {
    addNote.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await pinAndFasten();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    const message = await screen.findByRole("alert");
    expect(landed()).toContainElement(message);
    expect(navigate).not.toHaveBeenCalled();
    expect(storedPending()).toEqual([]);

    await user.click(tick());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(backToTheWall));
    expect(addNote).toHaveBeenCalledTimes(2);
  });

  it("shows two notes pinned up one after the other both as pending", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StickyNotes notes={[]} matUp />);
    await pinAndFasten();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    // the navigation lands on the wall, and the invite brings the mat back up
    rerender(<StickyNotes notes={[]} matUp={false} />);
    rerender(<StickyNotes notes={[]} matUp />);
    expect(matPaper()).toBeNull(); // a fresh start, not the note just sent

    await pinAndFasten();
    await user.type(nameTag() as HTMLElement, "lee{Enter}");
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    rerender(<StickyNotes notes={[]} matUp={false} />);

    const tiles = screen.getAllByRole("button", { name: /zoom note by/i });
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Zoom note by lee",
      "Zoom note by ada",
    ]);
    expect(screen.getAllByText(/^pending$/i)).toHaveLength(2);
  });
});
