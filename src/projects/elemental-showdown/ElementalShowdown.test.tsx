import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElementalShowdown } from "./ElementalShowdown";
import type { VoteCastResult, VoteReveal } from "./matchup-score";
import type { NextMatchup } from "./matchup-selection";
import { REVEAL_LINGER_MS } from "./Reveal";
import type { ShowdownElement } from "./schema";
import type { RateWindow, VoteCast } from "./showdown-schema";
import { statsElementOf } from "./showdown-stats";
import { UNLOCK_MS } from "./UnlockMoment";

// The route's only contribution is the Matchup the loader drew and the two
// server functions, so the tests hand those in. `vi.mock` is hoisted above
// this declaration, so the factory has to read it lazily.
const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => ({
  ...(await import("@/test/router-stub")),
  useNavigate: () => navigate,
}));

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

// Ten Votes with the crowd behind fire: the Voter crushed it too, as half of
// them did.
const reveal = (crowd: Partial<VoteReveal> = {}): VoteReveal => ({
  state: "reveal",
  counts: { "-2": 1, "-1": 0, "0": 1, "1": 3, "2": 5 },
  vote: 2,
  sameShare: 0.5,
  headline: "with",
  crowdMean: 1.4,
  ...crowd,
});

// A Vote this address has no room left for, in the window it ran past.
const limitedBy = (window: RateWindow): VoteCastResult => ({
  state: "limited",
  window,
});

type CastVote = (options: { data: VoteCast }) => Promise<VoteCastResult>;

function showdown({
  shown = matchup(fire, water),
  castVote = vi.fn<CastVote>(async () => reveal()),
  nextMatchup = async () => matchup(plant, fire),
}: {
  shown?: NextMatchup;
  castVote?: ReturnType<typeof vi.fn<CastVote>>;
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
  navigate.mockClear();
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

describe("the reveal", () => {
  it("keeps the crowd out of sight until the Vote is cast", () => {
    showdown();

    expect(screen.queryByText("▲ your vote")).toBeNull();
    expect(screen.queryByText("the crowd")).toBeNull();
    expect(screen.queryByText(/voted the same/)).toBeNull();
  });

  it("marks the Voter's own bar and says where the crowd stands", async () => {
    const user = userEvent.setup();
    showdown();

    await user.click(pill());

    const ownBar = await screen.findByText("▲ your vote");
    expect(ownBar.parentElement).toHaveTextContent("🔥 crushes");
    expect(screen.getByText("with the crowd")).toBeInTheDocument();
    expect(screen.getByText("50% voted the same, of 10")).toBeInTheDocument();
    expect(screen.getByText("the crowd")).toBeInTheDocument();
  });

  it("dresses a Matchup nobody has settled up as no crowd at all", async () => {
    const user = userEvent.setup();
    showdown({
      castVote: vi.fn<CastVote>(async () =>
        reveal({
          counts: { "-2": 0, "-1": 1, "0": 0, "1": 1, "2": 1 },
          vote: 2,
          sameShare: 1 / 3,
          headline: "early",
          crowdMean: null,
        }),
      ),
    });

    await user.click(pill());

    await screen.findByText("early days, only 3 votes");
    expect(screen.queryByText("the crowd")).toBeNull();
    expect(screen.queryByText(/voted the same/)).toBeNull();
  });
});

describe("after a Vote", () => {
  it("brings on the next Matchup when the draining bar runs out", async () => {
    // the clock, not userEvent: the wait the draining bar shows is a timer
    vi.useFakeTimers();
    showdown();
    fireEvent.click(pill());
    await act(async () => {});
    expect(screen.getByText("with the crowd")).toBeInTheDocument();

    await act(async () => void vi.advanceTimersByTime(REVEAL_LINGER_MS));

    expect(screen.getByText("plant")).toBeInTheDocument();
    expect(screen.queryByText("water")).toBeNull();
  });

  it("brings on the next Matchup at once when the Voter taps", async () => {
    const user = userEvent.setup();
    showdown();
    await user.click(pill());
    await screen.findByText("with the crowd");

    fireEvent.pointerDown(tug());

    await screen.findByText("plant");
  });

  it("casts once, however often the Tug is let go while the Vote is on its way", async () => {
    const user = userEvent.setup();
    const castVote = showdown({
      castVote: vi.fn<CastVote>(() => new Promise(() => {})),
    });

    await user.click(pill());
    await user.click(pill());

    expect(castVote).toHaveBeenCalledTimes(1);
  });

  it("keeps the Matchup up when the Vote never reached the server", async () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    showdown({
      castVote: vi.fn<CastVote>(() => Promise.reject(new Error("offline"))),
    });

    await user.click(pill());

    await waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    expect(screen.getByText("fire")).toBeInTheDocument();
    expect(screen.getByText("water")).toBeInTheDocument();
  });
});

describe("the Vote that unlocks the Stats", () => {
  const THE_ROSTER = [fire, water, plant].map(statsElementOf);

  // The reveal is read out as ever; the moment comes after it, on the clock
  // the draining bar runs on.
  async function castTheUnlockingVote() {
    vi.useFakeTimers();
    showdown({
      castVote: vi.fn<CastVote>(async () =>
        reveal({ unlockedElements: THE_ROSTER }),
      ),
    });
    fireEvent.click(pill());
    await act(async () => {});
    await act(async () => void vi.advanceTimersByTime(REVEAL_LINGER_MS));
  }

  it("flips a tile to every Element and stamps the screen before the Stats", async () => {
    await castTheUnlockingVote();

    expect(screen.getByText("stats unlocked")).toBeInTheDocument();
    for (const element of THE_ROSTER)
      expect(screen.getByText(element.emoji)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => void vi.advanceTimersByTime(UNLOCK_MS));

    expect(navigate).toHaveBeenCalledWith({ to: "/elemental-showdown/stats" });
  });

  it("goes on showing Matchups when the Vote unlocked nothing", async () => {
    vi.useFakeTimers();
    showdown();
    fireEvent.click(pill());
    await act(async () => {});

    await act(async () => void vi.advanceTimersByTime(REVEAL_LINGER_MS));

    expect(screen.getByText("plant")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("skips the wave for a Voter who asks for less motion", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: media === "(prefers-reduced-motion: reduce)",
    }));

    await castTheUnlockingVote();

    expect(screen.queryByText("stats unlocked")).toBeNull();
    expect(navigate).toHaveBeenCalledWith({ to: "/elemental-showdown/stats" });
  });

  it("opens the Stats on a browser with no Vibration API", async () => {
    expect(navigator.vibrate).toBeUndefined();

    await castTheUnlockingVote();
    await act(async () => void vi.advanceTimersByTime(UNLOCK_MS));

    expect(navigate).toHaveBeenCalledWith({ to: "/elemental-showdown/stats" });
  });
});

describe("a Vote the address has no room left for", () => {
  it("says slow down and keeps the Matchup up", async () => {
    const user = userEvent.setup();
    showdown({ castVote: vi.fn<CastVote>(async () => limitedBy("minute")) });

    await user.click(pill());

    expect(await screen.findByText("slow down a sec")).toBeInTheDocument();
    expect(screen.getByText("fire")).toBeInTheDocument();
    expect(screen.getByText("water")).toBeInTheDocument();
    expect(screen.queryByText("▲ your vote")).toBeNull();
  });

  it("springs the seam back, so the next drag simply votes again", async () => {
    const user = userEvent.setup();
    showdown({ castVote: vi.fn<CastVote>(async () => limitedBy("minute")) });

    tug().focus();
    await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");

    await screen.findByText("slow down a sec");
    expect(tug()).toHaveAttribute("aria-valuenow", "0");
  });

  it("sends the Voter away until tomorrow once the day is spent", async () => {
    const user = userEvent.setup();
    showdown({ castVote: vi.fn<CastVote>(async () => limitedBy("day")) });

    await user.click(pill());

    expect(
      await screen.findByText("that’s plenty for today, come back tomorrow"),
    ).toBeInTheDocument();
  });
});

describe("a Voter who has judged every Matchup", () => {
  it("is told how many that was, with no Tug left to drag", () => {
    showdown({ shown: { state: "exhausted", matchupCount: 1326 } });

    expect(screen.getByText(/judged all 1326 matchups/i)).toBeInTheDocument();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("is sent on to the Stats, with the link to pass around", () => {
    showdown({ shown: { state: "exhausted", matchupCount: 1326 } });

    expect(screen.getByRole("link", { name: "the stats" })).toHaveAttribute(
      "href",
      "/elemental-showdown/stats",
    );
    expect(
      screen.getByRole("button", { name: "send it to a friend" }),
    ).toBeInTheDocument();
  });
});

describe("the way back", () => {
  it("leaves a small link to the Portfolio on the Matchup", () => {
    showdown();

    expect(
      screen.getByRole("link", { name: /jacob cheatley/i }),
    ).toHaveAttribute("href", "/");
  });

  it("leaves a small link to the Stats on the Matchup", () => {
    showdown();

    expect(screen.getByRole("link", { name: "the stats" })).toHaveAttribute(
      "href",
      "/elemental-showdown/stats",
    );
  });
});
