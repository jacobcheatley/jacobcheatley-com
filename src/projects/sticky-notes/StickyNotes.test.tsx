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
import { SHAKE_MS } from "./desk-objects";
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

// --- what there is to look at ----------------------------------------------

// The mat is the surface the "← the wall" link is stuck to.
const mat = () =>
  screen.getByRole("link", { name: /the wall/i }).parentElement as HTMLElement;
// the note being pinned up, as the wall lays it out
const landing = () => document.querySelector<HTMLElement>("[data-landing]");
// the sheet lying on the mat, as opposed to any note on the wall
const matPaper = () => document.querySelector<HTMLElement>("[data-colour]");
const marksOnTheMat = () =>
  matPaper()?.querySelector("[data-elements]")?.childElementCount ?? 0;
const drawer = () => screen.queryByRole("region", { name: /fastener drawer/i });
const drawerTab = () =>
  screen.queryByRole("button", { name: /open the fastener drawer/i });
// the nine fasteners in the drawer, a red pin first
const choices = () =>
  within(drawer() as HTMLElement).getAllByRole("button", {
    name: /^fasten it with/i,
  });
// what the landed note is fastened with, as the wall wears it
const fastenedWith = () =>
  landing()?.querySelector("[data-press]")?.getAttribute("data-press") ??
  "none";
const nameTag = () => screen.queryByRole("textbox", { name: /your name/i });
const tick = () => screen.getByRole("button", { name: /sign the tag/i });
// what the one POST carried
const posted = () => addNote.mock.calls[0]?.[0]?.data;
const storedPending = () =>
  JSON.parse(localStorage.getItem("sticky-notes:pending") ?? "[]");
// the submit's navigation, as the router would be asked for it
const backToTheWall = { to: "/sticky-notes", replace: true };

// --- what there is to do -----------------------------------------------------

const tap = (name: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const pinItUp = () => tap(/pin it up/i);
const putTheDrawerAway = () => tap(/put the drawer away/i);

// The island is lazy, so wait for it on the real clock; then take the clock,
// because the fan only answers a tap once it has settled — and give it back
// once the sheet is down, since the submit waits on a promise.
async function tearOff(colour: string) {
  await screen.findByRole("button", { name: /fan out the pads/i });
  vi.useFakeTimers();
  tap(/fan out the pads/i);
  wait(300);
  tap(new RegExp(`${colour} sheet`, "i"));
  wait(300);
  vi.useRealTimers();
}

// a mark on the sheet, so there is content to come back with
function drawAStroke() {
  tap(/pick up the black marker/i);
  const paper = matPaper() as HTMLElement;
  fireEvent.pointerDown(paper, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(paper, { pointerId: 1, clientX: 30, clientY: 20 });
  fireEvent.pointerUp(paper, { pointerId: 1, clientX: 30, clientY: 20 });
}

// With the mat up (each test renders the page itself, for its `rerender`):
// a sheet torn off, marked if asked, and pinned up...
type Sheet = { colour?: string; marked?: boolean };
async function pinnedUp({ colour = "yellow", marked = false }: Sheet = {}) {
  await tearOff(colour);
  if (marked) drawAStroke();
  pinItUp();
}
// ...then fastened with a red pin, so the tag is out.
async function fastened(sheet?: Sheet) {
  await pinnedUp(sheet);
  tap(/with a red pin/i);
}

// Hold the next POST in flight; the function returned lets it arrive.
function holdThePost(): () => void {
  let arrive = () => {};
  addNote.mockReturnValue(
    new Promise((resolve) => {
      arrive = () => resolve({ status: "pending" });
    }),
  );
  return () => arrive();
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
    await tearOff("yellow");
    expect(landing()).toBeNull();

    pinItUp();

    expect(mat()).toHaveStyle({ transform: "translateY(100%)" });
    const note = landing();
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

describe("StickyNotes fastener drawer", () => {
  it("rises over the wall with the nine fasteners in it", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();
    expect(drawer()).not.toHaveAttribute("inert");
    expect(choices()).toHaveLength(9);
    expect(drawerTab()).toBeNull();
  });

  it("fastens the landed note with the one chosen, and folds away to a tab", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();

    expect(fastenedWith()).toBe("pin-red");
    expect(drawer()).toHaveAttribute("inert");
    expect(drawerTab()).toBeInTheDocument();
  });

  it("opens again from its tab, and takes another choice", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    fireEvent.click(drawerTab() as HTMLElement);

    expect(drawer()).not.toHaveAttribute("inert");
    expect(drawerTab()).toBeNull();
    tap(/with two staples/i);
    expect(fastenedWith()).toBe("staples");
  });

  it("leaves the note with no fastener when put away without a choice", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();
    putTheDrawerAway();

    expect(fastenedWith()).toBe("none");
    expect(drawer()).toHaveAttribute("inert");
    expect(drawerTab()).toBeInTheDocument();
  });
});

describe("StickyNotes tag", () => {
  it("hangs a name tag under the landed note once the drawer folds away", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();
    expect(nameTag()).toBeNull(); // the drawer is still up

    putTheDrawerAway();
    const input = nameTag();
    expect(landing()).toContainElement(input);
    // a name, not a sentence: no browser second-guessing what is typed
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("maxlength", "50");
    expect(input).toHaveAttribute("placeholder", "your name");
    // a class on purpose: #77 asks for CSS text-transform, so the name shows
    // lowercase as it is typed (the schema lowercases what is stored)
    expect(input).toHaveClass("lowercase");
  });

  it("keeps what was typed on the tag while the drawer is open again", async () => {
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada");
    fireEvent.click(drawerTab() as HTMLElement);
    putTheDrawerAway();

    expect(nameTag()).toHaveValue("ada");
  });

  it("pins the note up under the name on Enter, lowercased, fastener and all", async () => {
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
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
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "lee");
    await user.click(tick());

    await waitFor(() => expect(addNote).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ author: "lee" });
  });

  it("shakes a tag with no name on it, and posts nothing", async () => {
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "   ");
    await user.click(tick());

    expect(nameTag()?.closest("form")).toHaveAttribute("data-shake");
    expect(addNote).not.toHaveBeenCalled();
  });

  it("stops shaking on the clock, so a second blank signing shakes again", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    const tag = nameTag()?.closest("form");
    // the clock, not animationend: reduced motion has no animation to end
    vi.useFakeTimers();
    fireEvent.click(tick());
    expect(tag).toHaveAttribute("data-shake");
    wait(SHAKE_MS);
    expect(tag).not.toHaveAttribute("data-shake");

    fireEvent.click(tick());
    expect(tag).toHaveAttribute("data-shake");
  });
});

describe("StickyNotes focus", () => {
  it("starts in the drawer, not on the button the mat took away", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();
    expect(choices()[0]).toHaveFocus();
  });

  it("goes back into the drawer when it opens again from its tab", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    fireEvent.click(drawerTab() as HTMLElement);
    expect(choices()[0]).toHaveFocus();
  });

  it("moves to the name tag once a fastener is chosen", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    expect(nameTag()).toHaveFocus();
  });

  it("moves to the name tag when the drawer is put away", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();
    putTheDrawerAway();
    expect(nameTag()).toHaveFocus();
  });

  it("goes back to pin it up when the note goes back to the desk", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    tap(/back to the desk/i);
    expect(screen.getByRole("button", { name: /pin it up/i })).toHaveFocus();
  });
});

describe("StickyNotes abandoning a pin", () => {
  it("brings the note back to the desk with the mat, marks and all, unfastened", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened({ colour: "pink", marked: true });

    tap(/back to the desk/i);

    expect(mat()).toHaveStyle({ transform: "translateY(0)" });
    expect(landing()).toBeNull();
    expect(drawer()).toBeNull();
    expect(matPaper()).toBeVisible();
    expect(matPaper()).toHaveAttribute("data-colour", "pink");
    expect(marksOnTheMat()).toBe(1);
    // pinned up again, it lands as it left the mat: no fastener yet
    pinItUp();
    expect(fastenedWith()).toBe("none");
  });

  it("keeps the draft in memory when Back leaves mid-pin, for the next time the mat comes up", async () => {
    const { rerender } = render(<StickyNotes notes={[]} matUp />);
    await pinnedUp({ colour: "pink", marked: true });

    rerender(<StickyNotes notes={[]} matUp={false} />); // Back
    expect(landing()).toBeNull();
    expect(drawer()).toBeNull();

    rerender(<StickyNotes notes={[]} matUp />); // the invite again
    expect(mat()).toHaveStyle({ transform: "translateY(0)" });
    expect(matPaper()).toBeVisible();
    expect(matPaper()).toHaveAttribute("data-colour", "pink");
    expect(marksOnTheMat()).toBe(1);
  });
});

describe("StickyNotes submit", () => {
  it("keeps the note as pending and goes back to the wall in place of the editor's URL", async () => {
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(backToTheWall));
    expect(storedPending()).toMatchObject([
      { author: "ada", content: { fastener: "pin-red" } },
    ]);
  });

  it("posts once, however often the tag is signed while the note is on its way", async () => {
    const arrive = holdThePost();
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");
    await user.click(tick());
    await user.type(nameTag() as HTMLElement, "{Enter}");

    expect(addNote).toHaveBeenCalledTimes(1);
    await act(async () => arrive());
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  });

  it("keeps the fasteners shut while the note is on its way", async () => {
    holdThePost(); // and never let it arrive
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    // what was posted is what lands: no changing the fastener under it now
    expect(drawerTab()).toBeDisabled();
    for (const choice of choices()) expect(choice).toBeDisabled();
  });

  it("leaves the mat alone when a post from a pin that has since ended arrives", async () => {
    const arrive = holdThePost();
    const user = userEvent.setup();
    const { rerender } = render(<StickyNotes notes={[]} matUp />);
    await fastened({ colour: "pink", marked: true });
    await user.type(nameTag() as HTMLElement, "ada{Enter}");
    rerender(<StickyNotes notes={[]} matUp={false} />); // Back, mid-post
    rerender(<StickyNotes notes={[]} matUp />); // the invite again

    await act(async () => arrive());

    // it did reach the server, so it is pending all the same
    await waitFor(() =>
      expect(storedPending()).toMatchObject([{ author: "ada" }]),
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(matPaper()).toBeVisible();
    expect(marksOnTheMat()).toBe(1);
  });

  it("says so on the tag when the post fails, leaves the note where it landed, and lets it go again", async () => {
    addNote.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    const message = await screen.findByRole("alert");
    expect(landing()).toContainElement(message);
    expect(navigate).not.toHaveBeenCalled();
    expect(storedPending()).toEqual([]);

    await user.click(tick());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(backToTheWall));
    expect(addNote).toHaveBeenCalledTimes(2);
  });

  it("shows two notes pinned up one after the other both as pending", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    // the navigation lands on the wall, and the invite brings the mat back up
    rerender(<StickyNotes notes={[]} matUp={false} />);
    rerender(<StickyNotes notes={[]} matUp />);
    expect(matPaper()).toBeNull(); // a fresh start, not the note just sent

    await fastened();
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
