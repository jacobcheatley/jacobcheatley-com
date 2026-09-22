import { describe, expect, it } from "vitest";
import { scoreMatchup } from "./matchup-score";
import type { ShowdownElement } from "./schema";
import type { ScoredMatchup, ShowdownAggregate } from "./showdown-aggregate";
import { VOTE_VALUES, type VoteValue } from "./showdown-schema";
import { type OwnVote, type Story, storiesOf } from "./showdown-stories";

const element = (id: number, name: string): ShowdownElement => ({
  id,
  name,
  emoji: "🔥",
  colour: "#f2541b",
  kind: "common",
  isActive: true,
});

const fire = element(1, "fire");
const water = element(2, "water");
const plant = element(3, "plant");
const rock = element(4, "rock");
const metal = element(5, "metal");

// One Matchup as the crowd left it: how many Votes landed on each value, read
// from the first Element's side. The numbers below are Votes, so the Confidence
// each one earns is the real one.
function judged(
  one: ShowdownElement,
  other: ShowdownElement,
  tally: Partial<Record<VoteValue, number>>,
): ScoredMatchup {
  const asStored = one.id < other.id ? 1 : -1;
  let voteCount = 0;
  let valueSum = 0;
  let squareSum = 0;
  for (const value of VOTE_VALUES) {
    const count = tally[value] ?? 0;
    voteCount += count;
    valueSum += asStored * value * count;
    squareSum += value * value * count;
  }
  return {
    elementLow: asStored === 1 ? one : other,
    elementHigh: asStored === 1 ? other : one,
    score: scoreMatchup({ voteCount, valueSum, squareSum }),
  };
}

const crowd = (
  elements: ShowdownElement[],
  matchups: ScoredMatchup[],
): ShowdownAggregate => ({ elements, matchups, everyVoteCount: 0 });

const storyOf = (stories: Story[], kind: Story["kind"]) =>
  stories.find((story) => story.kind === kind);

// Enough Votes all the same way that the crowd is sure: a weak win, a crush and
// a Matchup nobody can separate.
const A_WIN = { 1: 20 };
const A_CRUSH = { 2: 40 };
const A_DEAD_HEAT = { 0: 20 };

describe("the crowd's Stories", () => {
  it("crowns the Element that wins the most matchups", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant],
        [
          judged(fire, water, A_WIN),
          judged(fire, plant, A_WIN),
          judged(water, plant, A_WIN),
        ],
      ),
      [],
    );

    expect(storyOf(stories, "champion")).toMatchObject({
      element: { name: "fire" },
      winCount: 2,
      opponentCount: 2,
    });
  });

  it("names the Element that loses the most the punching bag", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant],
        [
          judged(fire, water, A_WIN),
          judged(fire, plant, A_WIN),
          judged(water, plant, A_WIN),
        ],
      ),
      [],
    );

    expect(storyOf(stories, "punching-bag")).toMatchObject({
      element: { name: "plant" },
      lossCount: 2,
      opponentCount: 2,
    });
  });

  it("names the Element in the most crushes, either way round, the glass cannon", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant],
        [
          judged(fire, water, A_CRUSH),
          judged(plant, fire, A_CRUSH),
          judged(water, plant, A_WIN),
        ],
      ),
      [],
    );

    expect(storyOf(stories, "glass-cannon")).toMatchObject({
      element: { name: "fire" },
    });
  });

  it("names the Element with the most Neutral calls the diplomat", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant],
        [
          judged(fire, water, A_DEAD_HEAT),
          judged(fire, plant, A_DEAD_HEAT),
          judged(water, plant, A_WIN),
        ],
      ),
      [],
    );

    expect(storyOf(stories, "diplomat")).toMatchObject({
      element: { name: "fire" },
    });
  });

  it("picks the Controversial Matchup the crowd is most split over as the argument", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant],
        [
          judged(fire, water, { 2: 50, "-2": 50 }),
          judged(fire, plant, { 2: 40, "-2": 40, 0: 20 }),
        ],
      ),
      [],
    );

    expect(storyOf(stories, "argument")).toMatchObject({
      elements: [{ name: "fire" }, { name: "water" }],
      voteCount: 100,
    });
  });

  it("reads the biggest crush from the side that won it", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant],
        [judged(fire, water, A_WIN), judged(plant, water, A_CRUSH)],
      ),
      [],
    );

    expect(storyOf(stories, "biggest-crush")).toMatchObject({
      winner: { name: "plant" },
      loser: { name: "water" },
      voteCount: 40,
    });
  });

  it("finds the rock-paper-scissors cycle whose weakest win is the strongest", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant, rock, metal],
        [
          judged(fire, water, A_CRUSH),
          judged(water, plant, A_CRUSH),
          judged(plant, fire, A_CRUSH),
          judged(fire, rock, A_WIN),
          judged(rock, metal, A_WIN),
          judged(metal, fire, A_WIN),
        ],
      ),
      [],
    );

    expect(storyOf(stories, "triangle")).toMatchObject({
      elements: [{ name: "fire" }, { name: "water" }, { name: "plant" }],
    });
  });

  it("gives a tie to the alphabetically first Element", () => {
    // water holds the lower id, so a Story that took the roster in its own
    // order would crown it rather than fire.
    const lowId = element(1, "water");
    const highId = element(2, "fire");
    const stories = storiesOf(
      crowd(
        [lowId, highId, plant, rock],
        [judged(lowId, plant, A_WIN), judged(highId, rock, A_WIN)],
      ),
      [],
    );

    expect(storyOf(stories, "champion")).toMatchObject({
      element: { name: "fire" },
    });
  });

  it("leaves a faint Matchup out of every Story", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant, rock],
        [judged(fire, water, { 2: 3 }), judged(plant, rock, A_DEAD_HEAT)],
      ),
      [],
    );

    expect(storyOf(stories, "champion")).toBeUndefined();
    expect(storyOf(stories, "diplomat")).toMatchObject({
      element: { name: "plant" },
    });
  });

  it("leaves out a Story nothing qualifies for", () => {
    const stories = storiesOf(
      crowd([fire, water], [judged(fire, water, A_WIN)]),
      [],
    );

    expect(storyOf(stories, "champion")).toBeDefined();
    expect(storyOf(stories, "argument")).toBeUndefined();
    expect(storyOf(stories, "triangle")).toBeUndefined();
  });

  it("tells no Story at all while the crowd has settled nothing", () => {
    expect(
      storiesOf(crowd([fire, water], [judged(fire, water, { 2: 3 })]), []),
    ).toEqual([]);
  });
});

describe("the Voter's own Story", () => {
  // The crowd calls fire the winner of both its Matchups and cannot separate
  // water from plant.
  const theCrowd = crowd(
    [fire, water, plant],
    [
      judged(fire, water, A_WIN),
      judged(fire, plant, A_WIN),
      judged(water, plant, A_DEAD_HEAT),
    ],
  );

  // The Voter sides with the crowd on fire against water and on water against
  // plant, and backs plant over fire against it.
  const ownVotes: OwnVote[] = [
    { elementLow: fire.id, elementHigh: water.id, value: 1 },
    { elementLow: fire.id, elementHigh: plant.id, value: -1 },
    { elementLow: water.id, elementHigh: plant.id, value: 0 },
  ];

  it("counts the share of the Voter's settled Votes that side with the crowd", () => {
    const stories = storiesOf(theCrowd, ownVotes);

    expect(storyOf(stories, "you")).toMatchObject({
      record: { withTheCrowdShare: 2 / 3 },
    });
  });

  it("names the Vote furthest from the crowd as the hottest take, the Voter's side first", () => {
    const stories = storiesOf(theCrowd, ownVotes);

    expect(storyOf(stories, "you")).toMatchObject({
      record: {
        hottestTake: {
          elements: [{ name: "plant" }, { name: "fire" }],
          vote: 1,
        },
      },
    });
  });

  it("says so when the crowd has settled none of the Voter's Matchups", () => {
    const stories = storiesOf(
      crowd(
        [fire, water, plant, rock],
        [judged(fire, water, { 2: 3 }), judged(plant, rock, A_DEAD_HEAT)],
      ),
      [{ elementLow: fire.id, elementHigh: water.id, value: 2 }],
    );

    expect(storyOf(stories, "you")).toEqual({ kind: "you", record: null });
  });
});
