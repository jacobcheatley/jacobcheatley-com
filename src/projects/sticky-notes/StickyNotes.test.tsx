import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteContent } from "./note-schema";
import { StickyNotes } from "./StickyNotes";

// The whole page (#77): the wall, the mat over it, and pinning a note up from
// one onto the other. The route's only contribution is `matUp` (whether the URL
// is /sticky-notes/new), so the tests drive that prop the way Back and the
// invite drive the URL. Motion is CSS and FLIP; these assert the state it
// carries, never the flight.

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
// because the fan only answers a tap once it has settled.
async function tearOff(colour = "yellow") {
  await screen.findByRole("button", { name: /fan out the pads/i });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /fan out the pads/i }));
  wait(300);
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`${colour} sheet`, "i") }),
  );
  wait(300);
}

beforeEach(() => {
  // jsdom has no scrolling, and says so loudly
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
