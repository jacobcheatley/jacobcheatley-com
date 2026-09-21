import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Confidence, Effectiveness } from "./matchup-score";
import { Stats } from "./Stats";
import type {
  JudgedMatchup,
  LockedStats,
  StatsElement,
  UnlockedStats,
} from "./showdown-stats";
import type { Story } from "./showdown-stories";

// The route's only contribution is what the loader gated, so the tests hand
// that in.
vi.mock("@tanstack/react-router", () => import("@/test/router-stub"));

const locked = (counts: Partial<LockedStats> = {}): LockedStats => ({
  state: "locked",
  ownVoteCount: 17,
  everyVoteCount: 240,
  elementCount: 52,
  ...counts,
});

describe("the locked Stats", () => {
  it("shows both meters against the numbers that open them", () => {
    render(<Stats stats={locked()} />);

    expect(screen.getByText("your Votes: 17 of 20")).toBeInTheDocument();
    expect(
      screen.getByText("everyone’s Votes: 240 of 250"),
    ).toBeInTheDocument();
  });

  it("holds a met meter at its number rather than running past it", () => {
    render(<Stats stats={locked({ ownVoteCount: 23 })} />);

    expect(screen.getByText("your Votes: 20 of 20")).toBeInTheDocument();
  });

  it("says how many more Votes the Voter owes", () => {
    render(<Stats stats={locked({ ownVoteCount: 17 })} />);

    expect(
      screen.getByText("3 more from you and it opens."),
    ).toBeInTheDocument();
  });

  it("leaves it to the crowd once the Voter has done their part", () => {
    render(<Stats stats={locked({ ownVoteCount: 20 })} />);

    expect(
      screen.getByText(
        "You have done your part. It opens when the crowd catches up.",
      ),
    ).toBeInTheDocument();
  });

  it("sends the Voter back to the Matchups", () => {
    render(<Stats stats={locked()} />);

    expect(screen.getByRole("link", { name: "keep voting" })).toHaveAttribute(
      "href",
      "/elemental-showdown",
    );
  });

  it("asks for a friend while the crowd is the number that is short", () => {
    render(<Stats stats={locked({ everyVoteCount: 240 })} />);

    expect(
      screen.getByRole("button", { name: "bring a friend, fill the bar" }),
    ).toBeInTheDocument();
  });
});

const fire: StatsElement = {
  id: 1,
  name: "fire",
  emoji: "🔥",
  colour: "#f2541b",
};
const water: StatsElement = {
  id: 2,
  name: "water",
  emoji: "💧",
  colour: "#2f7fe0",
};
const plant: StatsElement = {
  id: 3,
  name: "plant",
  emoji: "🌿",
  colour: "#3f9d4a",
};
const rock: StatsElement = {
  id: 4,
  name: "rock",
  emoji: "🪨",
  colour: "#8a7560",
};

// A call the crowd has made, read from the lower-id Element's side.
const call = (
  elementLow: StatsElement,
  elementHigh: StatsElement,
  effectiveness: Effectiveness,
  meanVote: number,
  confidence: Confidence = "solid",
): JudgedMatchup => ({
  elementLow: elementLow.id,
  elementHigh: elementHigh.id,
  effectiveness,
  confidence,
  meanVote,
});

const unlocked = (
  elements: StatsElement[],
  matchups: JudgedMatchup[] = [],
  stories: Story[] = [],
): UnlockedStats => ({ state: "unlocked", elements, matchups, stories });

const chip = (name: string) => screen.getByRole("button", { name });

describe("the Stats once they are open", () => {
  it("has no lock left to show", () => {
    render(<Stats stats={unlocked([fire])} />);

    expect(screen.queryByText("the stats are locked")).toBeNull();
    expect(screen.queryByText(/of 250/)).toBeNull();
  });

  it("rails every Element alphabetically", () => {
    render(<Stats stats={unlocked([water, plant, fire])} />);

    const rail = within(screen.getByRole("navigation")).getAllByRole("button");

    expect(rail.map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "fire",
      "plant",
      "water",
    ]);
  });

  it("opens on the alphabetically first Element's page", () => {
    render(<Stats stats={unlocked([water, fire])} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "fire" }),
    ).toBeInTheDocument();
  });

  it("sorts an opponent into the band of the crowd's call on it", () => {
    render(
      <Stats
        stats={unlocked(
          [fire, water, plant],
          [call(fire, water, "½×", -0.9), call(fire, plant, "4×", 1.9)],
        )}
      />,
    );

    expect(screen.getByRole("heading", { name: "crushes 4×" })).toBeVisible();
    expect(chip("🌿 plant")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "loses to ½×" })).toBeVisible();
    expect(chip("💧 water")).toBeInTheDocument();
  });

  it("omits a band no opponent landed in", () => {
    render(
      <Stats stats={unlocked([fire, water], [call(fire, water, "4×", 1.9)])} />,
    );

    expect(screen.getByRole("heading", { name: "crushes 4×" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /beats/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /even with/ })).toBeNull();
  });

  it("reads the Element's record with its nemesis and its favourite victim", () => {
    render(
      <Stats
        stats={unlocked(
          [fire, water, plant],
          [call(fire, water, "½×", -0.9), call(fire, plant, "4×", 1.9)],
        )}
      />,
    );

    expect(
      screen.getByText(
        "wins 1, loses 1. Nemesis: 💧 water. Favourite victim: 🌿 plant.",
      ),
    ).toBeInTheDocument();
  });

  it("counts the opponents the crowd has not judged behind one line", () => {
    render(
      <Stats
        stats={unlocked(
          [fire, water, plant, rock],
          [call(fire, water, "2×", 1.2)],
        )}
      />,
    );

    expect(screen.getByText("2 not yet judged")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "🌿 plant" })).toBeNull();
  });

  it("outlines a chip by how sure the crowd is, and says what that means", () => {
    render(
      <Stats
        stats={unlocked(
          [fire, water, plant, rock],
          [
            call(fire, water, "2×", 1.2, "solid"),
            call(fire, plant, "2×", 1.1, "medium"),
            call(fire, rock, "2×", 1, "faint"),
          ],
        )}
      />,
    );

    expect(chip("💧 water")).toHaveClass("border-[3px]");
    expect(chip("🌿 plant")).toHaveClass("border-[1.5px]");
    expect(chip("🪨 rock")).toHaveClass("border-dashed");
    expect(
      screen.getByText(
        "Heavy outline: the crowd is sure. Thin: fairly sure. Dashed: a guess from a few Votes.",
      ),
    ).toBeInTheDocument();
  });

  it("opens an opponent's page, read the other way round, when its chip is tapped", async () => {
    const user = userEvent.setup();
    render(
      <Stats stats={unlocked([fire, water], [call(fire, water, "2×", 1.2)])} />,
    );

    await user.click(chip("💧 water"));

    expect(
      screen.getByRole("heading", { level: 1, name: "water" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "loses to ½×" })).toBeVisible();
    expect(chip("🔥 fire")).toBeInTheDocument();
  });

  it("opens an Element's page when its rail tile is tapped", async () => {
    const user = userEvent.setup();
    render(<Stats stats={unlocked([fire, water])} />);

    await user.click(chip("water"));

    expect(
      screen.getByRole("heading", { level: 1, name: "water" }),
    ).toBeInTheDocument();
  });

  it("leads with the crowd's Stories as headlines", () => {
    render(
      <Stats
        stats={unlocked(
          [fire, water],
          [],
          [
            {
              kind: "champion",
              element: fire,
              winCount: 34,
              opponentCount: 51,
            },
          ],
        )}
      />,
    );

    expect(screen.getByText("the champion")).toBeInTheDocument();
    expect(screen.getByText("fire wins the most")).toBeInTheDocument();
    expect(
      screen.getByText("It beats 34 of the other 51."),
    ).toBeInTheDocument();
  });

  it("tells the Voter their own share and hottest take", () => {
    render(
      <Stats
        stats={unlocked(
          [fire, water],
          [],
          [
            {
              kind: "you",
              record: {
                withTheCrowdShare: 0.64,
                hottestTake: { elements: [water, fire], vote: 2 },
              },
            },
          ],
        )}
      />,
    );

    expect(
      screen.getByText("with the crowd 64% of the time"),
    ).toBeInTheDocument();
    expect(screen.getByText(/💧 water crushes 🔥 fire\./)).toBeInTheDocument();
  });

  it("shows one card saying it is too early while no Story qualifies", () => {
    render(<Stats stats={unlocked([fire, water], [], [])} />);

    expect(screen.getByText("too early to call")).toBeInTheDocument();
    expect(
      screen.getByText("Keep voting: nothing is settled yet."),
    ).toBeInTheDocument();
  });

  it("sends the Voter back to the Matchups at the foot", () => {
    render(<Stats stats={unlocked([fire])} />);

    expect(screen.getByRole("link", { name: "keep voting" })).toHaveAttribute(
      "href",
      "/elemental-showdown",
    );
    expect(
      screen.getByRole("button", { name: "send it to a friend" }),
    ).toBeInTheDocument();
  });
});
