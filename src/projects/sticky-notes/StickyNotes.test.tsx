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
import { noteContent } from "./note-fixture";
import { readPending } from "./pending-note";
import { StickyNotes } from "./StickyNotes";

// The route's only contribution is `matUp` (whether the URL is
// /sticky-notes/new), so the tests drive that prop the way Back and the invite
// drive the URL. Motion is CSS and FLIP; these assert the state it carries.

// The router and the write server fn don't belong in jsdom: stub them at the
// seams. `vi.mock` is hoisted above these declarations, so the factories have
// to read them lazily.
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
  content: noteContent(),
});

// The mat is the surface the "← the wall" link is stuck to.
const mat = () =>
  screen.getByRole("link", { name: /the wall/i }).parentElement as HTMLElement;
const scene = () => screen.queryByRole("dialog", { name: /pin it up/i });
const lifted = () => document.querySelector<HTMLElement>("[data-spotlight]");
// the sheet lying on the mat, as opposed to any note on the wall
const matPaper = () => document.querySelector<HTMLElement>("[data-colour]");
const marksOnTheMat = () =>
  matPaper()?.querySelector("[data-elements]")?.childElementCount ?? 0;
// the nine fasteners under the lifted note, a red pin first
const choices = () =>
  within(scene() as HTMLElement).getAllByRole("button", {
    name: /^fasten it with/i,
  });
const fastenedWith = () =>
  lifted()?.querySelector("[data-press]")?.getAttribute("data-press") ?? "none";
const nameTag = () => screen.queryByRole("textbox", { name: /your name/i });
// the tag itself: the paper the field is written on
const tag = () => nameTag()?.parentElement as HTMLElement;
const tick = () => screen.getByRole("button", { name: /sign the tag/i });
const backTape = () =>
  screen.getByRole("button", { name: /back to the desk/i });
const posted = () => addNote.mock.calls[0]?.[0]?.data;
const backToTheWall = { to: "/sticky-notes", replace: true };

const tap = (name: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const pinItUp = () => tap(/pin it up/i);

// The island is lazy, so wait for its pad chooser, then tear a sheet off and
// wait for it to land: a sheet still flying off its pad is busy, and takes no
// marks.
async function tearOff(colour: string) {
  const pad = new RegExp(`${colour} sheet`, "i");
  await screen.findByRole("button", { name: pad });
  tap(pad);
  await waitFor(() => expect(matPaper()).toHaveAttribute("aria-busy", "false"));
}

// a mark on the sheet, so there is content to come back with: a torn sheet
// comes with the black marker already in hand, so no tool is picked up first
function drawAStroke() {
  const paper = matPaper() as HTMLElement;
  fireEvent.pointerDown(paper, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(paper, { pointerId: 1, clientX: 30, clientY: 20 });
  fireEvent.pointerUp(paper, { pointerId: 1, clientX: 30, clientY: 20 });
}

type Sheet = { colour?: string; marked?: boolean };
async function pinnedUp({ colour = "yellow", marked = false }: Sheet = {}) {
  await tearOff(colour);
  if (marked) drawAStroke();
  pinItUp();
}
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
    await screen.findByRole("button", { name: /tear off a yellow sheet/i });
    expect(screen.queryByRole("button", { name: /pin it up/i })).toBeNull();
  });

  it("slides the mat down and lifts the note into the Spotlight, at the top of the page", async () => {
    render(<StickyNotes notes={[approved("sam")]} matUp />);
    await tearOff("yellow");
    expect(scene()).toBeNull();

    pinItUp();

    expect(mat()).toHaveStyle({ transform: "translateY(100%)" });
    expect(
      within(lifted() as HTMLElement).getByRole("img", {
        name: /sticky note/i,
      }),
    ).toBeInTheDocument();
    // the Spotlight hangs over the wall, which stays inert under it: nothing
    // on the board can take the keyboard while the note is being pinned
    expect(lifted()?.closest("[inert]")).toBeNull();
    expect(document.querySelector("[inert]")).not.toBeNull();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    // it flew off the mat: no second copy of it left lying there
    expect(matPaper()).not.toBeVisible();
    // the board still holds the invite and sam's note, and nothing else
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the note, the nine fasteners and the tag all at once", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();

    const pinning = scene() as HTMLElement;
    expect(pinning).toContainElement(lifted());
    expect(choices()).toHaveLength(9);
    expect(pinning).toContainElement(nameTag());
    expect(pinning).toContainElement(backTape());
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("button", { name: /^fasteners$/i })).toBeNull();
  });
});

describe("StickyNotes fasteners", () => {
  it("presses the one chosen onto the note, and swaps it for another", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();

    expect(fastenedWith()).toBe("pin-red");
    expect(choices()[0]).toHaveAttribute("aria-pressed", "true");

    tap(/with two staples/i);
    expect(fastenedWith()).toBe("staples");
    expect(choices()[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("leaves the note holding on by itself when none is chosen", async () => {
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();
    expect(fastenedWith()).toBe("none");

    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    await waitFor(() => expect(addNote).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ content: { fastener: "none" } });
  });
});

describe("StickyNotes tag", () => {
  it("hangs under the fasteners with nothing for a password manager to fill", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();

    const input = nameTag() as HTMLElement;
    // not a form: a lone field in one is what a manager reads as a login
    expect(input.closest("form")).toBeNull();
    expect(input).not.toHaveAttribute("name");
    expect(input).not.toHaveAttribute("id");
    // a name, not a sentence: no browser second-guessing what is typed
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("maxlength", "50");
    expect(input).toHaveAttribute("placeholder", "sign here");
    // the managers' own opt-outs, one per manager
    expect(input).toHaveAttribute("data-1p-ignore");
    expect(input).toHaveAttribute("data-lpignore", "true");
    expect(input).toHaveAttribute("data-bwignore");
    expect(input).toHaveAttribute("data-form-type", "other");
    // a class on purpose: CSS text-transform shows the name lowercase as it is
    // typed, while the schema lowercases what is stored
    expect(input).toHaveClass("lowercase");
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

    expect(tag()).toHaveAttribute("data-shake");
    expect(addNote).not.toHaveBeenCalled();
  });

  it("stops shaking on the clock, so a second blank signing shakes again", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    // the clock, not animationend: reduced motion has no animation to end
    vi.useFakeTimers();
    fireEvent.click(tick());
    expect(tag()).toHaveAttribute("data-shake");
    wait(SHAKE_MS);
    expect(tag()).not.toHaveAttribute("data-shake");

    fireEvent.click(tick());
    expect(tag()).toHaveAttribute("data-shake");
  });
});

describe("StickyNotes focus", () => {
  it("starts on the way back, not on the button the mat took away", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();

    expect(backTape()).toHaveFocus();
    expect(scene()).toContainElement(document.activeElement as HTMLElement);
  });

  it("leaves the tag alone: no keyboard comes up for it", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();
    expect(nameTag()).not.toHaveFocus();

    tap(/with a red pin/i);
    expect(nameTag()).not.toHaveFocus();
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
    expect(scene()).toBeNull();
    expect(matPaper()).toBeVisible();
    expect(matPaper()).toHaveAttribute("data-colour", "pink");
    expect(marksOnTheMat()).toBe(1);
    pinItUp();
    expect(fastenedWith()).toBe("none");
  });

  it("takes Escape as the same way back", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await fastened();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(scene()).toBeNull();
    expect(mat()).toHaveStyle({ transform: "translateY(0)" });
  });

  it("stays put when the darkened wall itself is tapped", async () => {
    render(<StickyNotes notes={[]} matUp />);
    await pinnedUp();

    // no × and no way out on the scrim: the pinning brings its own
    expect(screen.queryByRole("button", { name: /close note/i })).toBeNull();
    fireEvent.click(scene() as HTMLElement);
    expect(scene()).not.toBeNull();
  });

  it("keeps the draft in memory when Back leaves mid-pin, for the next time the mat comes up", async () => {
    const { rerender } = render(<StickyNotes notes={[]} matUp />);
    await pinnedUp({ colour: "pink", marked: true });

    rerender(<StickyNotes notes={[]} matUp={false} />); // Back
    expect(scene()).toBeNull();

    rerender(<StickyNotes notes={[]} matUp />); // the invite again
    expect(mat()).toHaveStyle({ transform: "translateY(0)" });
    expect(matPaper()).toBeVisible();
    expect(matPaper()).toHaveAttribute("data-colour", "pink");
    expect(marksOnTheMat()).toBe(1);
  });
});

describe("StickyNotes leaving the mat mid-placing", () => {
  it("fixes a box being placed when Back takes the mat down, and leaves Escape to the wall", async () => {
    const { rerender } = render(
      <StickyNotes notes={[approved("sam")]} matUp />,
    );
    await tearOff("yellow");
    tap(/write with the marker/i);
    const paper = matPaper() as HTMLElement;
    fireEvent.pointerDown(paper, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(paper, { pointerId: 1 });
    fireEvent.change(screen.getByRole("textbox", { name: /text box/i }), {
      target: { value: "hi" },
    });

    rerender(<StickyNotes notes={[approved("sam")]} matUp={false} />); // Back
    expect(screen.queryByRole("textbox", { name: /text box/i })).toBeNull();
    expect(marksOnTheMat()).toBe(1);

    tap(/zoom note by sam/i);
    // sent where the key goes, so an editor listener could stop it on the way
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "Escape",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("StickyNotes submit", () => {
  it("keeps the note as pending and goes back to the wall in place of the editor's URL", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(backToTheWall));
    expect(readPending()).toMatchObject([
      { author: "ada", content: { fastener: "pin-red" } },
    ]);

    rerender(<StickyNotes notes={[]} matUp={false} />); // the navigation lands
    expect(scene()).toBeNull();
    // the slot it flies home into, newest-first under the invite
    expect(document.querySelector("[data-newest]")).toContainElement(
      screen.getByRole("button", { name: /zoom note by ada/i }),
    );
  });

  it("shows the tag sending, and holds the fasteners, while the note is on its way", async () => {
    holdThePost(); // and never let it arrive
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    expect(tag()).toHaveAttribute("aria-busy", "true");
    expect(tick()).toBeDisabled();
    for (const choice of choices()) expect(choice).toBeDisabled();
  });

  it("posts once, however often the tag is signed while the note is on its way", async () => {
    const arrive = holdThePost();
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");
    await user.type(nameTag() as HTMLElement, "{Enter}");

    expect(addNote).toHaveBeenCalledTimes(1);
    await act(async () => arrive());
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
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
      expect(readPending()).toMatchObject([{ author: "ada" }]),
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(matPaper()).toBeVisible();
    expect(marksOnTheMat()).toBe(1);
  });

  it("says so on the tag when the post fails, leaves the note in the Spotlight, and lets it go again", async () => {
    addNote.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<StickyNotes notes={[]} matUp />);
    await fastened();
    await user.type(nameTag() as HTMLElement, "ada{Enter}");

    const message = await screen.findByRole("alert");
    expect(scene()).toContainElement(message);
    expect(navigate).not.toHaveBeenCalled();
    expect(readPending()).toEqual([]);

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
    expect(
      screen.getByRole("button", { name: /tear off a yellow sheet/i }),
    ).toHaveFocus();

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
