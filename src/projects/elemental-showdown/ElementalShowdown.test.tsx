import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElementalShowdown } from "./ElementalShowdown";
import type { NextMatchup } from "./matchup-selection";
import type { ShowdownElement } from "./schema";
import type { VoteCast } from "./showdown-schema";

// The route's only contribution is the Matchup the loader drew and the two
// server functions, so the tests hand those in.
vi.mock("@tanstack/react-router", () => import("@/test/router-stub"));

const element = (
  id: number,
  name: string,
  emoji: string,
  colour: string,
): ShowdownElement => ({
  id,
  name,
  emoji,
  colour,
  kind: "common",
  isActive: true,
});

const fire = element(1, "fire", "🔥", "#f2541b");
const water = element(2, "water", "💧", "#2f7fe0");
const plant = element(3, "plant", "🌿", "#3f9d4a");

const matchup = (
  top: ShowdownElement,
  bottom: ShowdownElement,
): NextMatchup => ({ state: "matchup", top, bottom });

function showdown({
  shown = matchup(fire, water),
  castVote = vi.fn<(options: { data: VoteCast }) => Promise<void>>(
    async () => {},
  ),
  nextMatchup = async () => matchup(plant, fire),
}: {
  shown?: NextMatchup;
  castVote?: ReturnType<
    typeof vi.fn<(options: { data: VoteCast }) => Promise<void>>
  >;
  nextMatchup?: () => Promise<NextMatchup>;
} = {}) {
  render(
    <ElementalShowdown
      shown={shown}
      castVote={castVote}
      nextMatchup={nextMatchup}
    />,
  );
  return castVote;
}

const tug = () => screen.getByRole("slider");
// The pill on the seam: the only button the Tug has.
const pill = () => screen.getByRole("button");
const cast = (value: number) => ({
  data: { topElementId: 1, bottomElementId: 2, value },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Tug as a slider", () => {
  it("casts the Vote the arrow keys walked the seam to", async () => {
    const user = userEvent.setup();
    const castVote = showdown();

    tug().focus();
    await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");

    expect(castVote).toHaveBeenCalledWith(cast(2));
  });

  it("casts for the Element on the bottom when the seam goes the other way", async () => {
    const user = userEvent.setup();
    const castVote = showdown();

    tug().focus();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(castVote).toHaveBeenCalledWith(cast(-1));
  });

  it("reads the Vote as a sentence while the seam moves", async () => {
    const user = userEvent.setup();
    showdown();

    tug().focus();
    expect(tug()).toHaveAttribute("aria-valuetext", "too close to call");

    await user.keyboard("{ArrowUp}");
    expect(tug()).toHaveAttribute("aria-valuetext", "fire beats water");
    expect(pill()).toHaveAccessibleName("fire beats water");

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(tug()).toHaveAttribute("aria-valuetext", "water crushes fire");
  });

  it("holds the seam at a strong win however many times the key is pressed", async () => {
    const user = userEvent.setup();
    const castVote = showdown();

    tug().focus();
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{Enter}");

    expect(castVote).toHaveBeenCalledWith(cast(2));
  });

  it("casts too close to call from the pill at rest", async () => {
    const user = userEvent.setup();
    const castVote = showdown();

    expect(pill()).toHaveAccessibleName("too close to call");
    await user.click(pill());

    expect(castVote).toHaveBeenCalledWith(cast(0));
  });

  it("marks where the seam lands for each Vote value, each naming its winner", () => {
    showdown();

    for (const label of [
      "🔥 crushes",
      "🔥 beats",
      "too close",
      "💧 beats",
      "💧 crushes",
    ])
      expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("after a Vote", () => {
  it("brings on the next Matchup", async () => {
    const user = userEvent.setup();
    showdown();

    await user.click(pill());

    await screen.findByText("plant");
    expect(screen.queryByText("water")).toBeNull();
  });

  it("casts once, however often the Tug is let go while the Vote is on its way", async () => {
    const user = userEvent.setup();
    const castVote = showdown({
      castVote: vi.fn<(options: { data: VoteCast }) => Promise<void>>(
        () => new Promise(() => {}),
      ),
    });

    await user.click(pill());
    await user.click(pill());

    expect(castVote).toHaveBeenCalledTimes(1);
  });

  it("keeps the Matchup up when the Vote never reached the server", async () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    showdown({
      castVote: vi.fn<(options: { data: VoteCast }) => Promise<void>>(() =>
        Promise.reject(new Error("offline")),
      ),
    });

    await user.click(pill());

    await waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    expect(screen.getByText("fire")).toBeInTheDocument();
    expect(screen.getByText("water")).toBeInTheDocument();
  });
});

describe("a Voter who has judged every Matchup", () => {
  it("is told how many that was, with no Tug left to drag", () => {
    showdown({ shown: { state: "exhausted", matchupCount: 1326 } });

    expect(screen.getByText(/judged all 1326 matchups/i)).toBeInTheDocument();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});

describe("the way back", () => {
  it("leaves a small link to the Portfolio on the Matchup", () => {
    showdown();

    expect(
      screen.getByRole("link", { name: /jacob cheatley/i }),
    ).toHaveAttribute("href", "/");
  });
});
