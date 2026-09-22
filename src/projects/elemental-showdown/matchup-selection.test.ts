import { describe, expect, it } from "vitest";
import { drawMatchup, type VotedMatchup } from "./matchup-selection";
import type { ShowdownElement } from "./schema";
import {
  aggregateOf,
  type MatchupSumsRow,
  type ShowdownAggregate,
} from "./showdown-aggregate";
import { shownElementOf } from "./showdown-stats";
import { element } from "./test-elements";

const fire = element(1, "fire");
const water = element(2, "water");
const plant = element(3, "plant");
const magnet = element(4, "magnet", { kind: "rare" });

const rosterOf = (
  elements: ShowdownElement[],
  matchupSums: MatchupSumsRow[] = [],
): ShowdownAggregate => aggregateOf({ elements, matchupSums });

// Every draw takes its numbers in order — one per candidate Matchup, then the
// coin flip — and a source that runs dry keeps handing out the last one, so a
// test only names the numbers it cares about.
const randomFrom = (...numbers: number[]) => {
  let at = 0;
  return () => numbers[Math.min(at++, numbers.length - 1)] ?? 0;
};

// Which Element is on top is a coin flip, so a Matchup is read as a pair.
const pairOf = (drawn: ReturnType<typeof drawMatchup>) =>
  drawn.state === "matchup"
    ? [drawn.top.name, drawn.bottom.name].sort()
    : ["exhausted"];

// Votes on Matchups of Elements since switched off: they count towards this
// Voter's own total without taking an Active Matchup out of the draw.
const retiredVotes = (count: number): VotedMatchup[] =>
  Array.from({ length: count }, (_, at) => ({
    elementLow: 90,
    elementHigh: 91 + at,
  }));

// A Matchup a settled crowd has voted on many times over: its Votes all agree,
// so the crowd has little left to learn from another one.
const settledSums = (
  elementLow: number,
  elementHigh: number,
): MatchupSumsRow => ({
  elementLow,
  elementHigh,
  voteCount: 40,
  valueSum: 80,
  squareSum: 160,
});

describe("drawMatchup", () => {
  it("never offers a Matchup this Voter has voted on", () => {
    const votes = [
      { elementLow: fire.id, elementHigh: water.id },
      { elementLow: fire.id, elementHigh: plant.id },
    ];

    for (const draw of [0, 0.5, 0.99]) {
      const drawn = drawMatchup({
        aggregate: rosterOf([fire, water, plant]),
        votes,
        random: randomFrom(draw),
      });

      expect(pairOf(drawn)).toEqual(["plant", "water"]);
    }
  });

  // One number per candidate Matchup and then the coin flip, laid out so that
  // the second Matchup of the roster — the one with the third Element in it —
  // draws the number nearest zero and wins any draw it is a candidate in.
  const drawingTheThirdElement = () => randomFrom(0.9, 0.1, 0.9);

  it("never offers a Matchup with an Element switched off", () => {
    const retired = element(3, "santa", { kind: "rare", isActive: false });

    const drawn = drawMatchup({
      aggregate: rosterOf([fire, water, retired]),
      votes: [],
      random: drawingTheThirdElement(),
    });

    expect(pairOf(drawn)).toEqual(["fire", "water"]);
  });

  it("keeps a Voter's first five Matchups between two Common Elements", () => {
    const drawn = drawMatchup({
      aggregate: rosterOf([fire, water, magnet]),
      votes: retiredVotes(4),
      random: drawingTheThirdElement(),
    });

    expect(pairOf(drawn)).toEqual(["fire", "water"]);
  });

  it("opens the whole roster to a Voter who has cast five Votes", () => {
    const drawn = drawMatchup({
      aggregate: rosterOf([fire, water, magnet]),
      votes: retiredVotes(5),
      random: drawingTheThirdElement(),
    });

    expect(pairOf(drawn)).toEqual(["fire", "magnet"]);
  });

  it("offers a Matchup past the Common ones rather than ending a new Voter's run early", () => {
    const drawn = drawMatchup({
      aggregate: rosterOf([fire, water, magnet]),
      votes: [{ elementLow: fire.id, elementHigh: water.id }],
      random: randomFrom(0.5),
    });

    expect(pairOf(drawn)).not.toEqual(["exhausted"]);
  });

  it("weighs the Matchup the crowd is least sure of heaviest", () => {
    const roster = [fire, water, plant];
    const pairs = [
      [fire, water],
      [fire, plant],
      [water, plant],
    ] as const;

    for (const unsettled of pairs) {
      const drawn = drawMatchup({
        aggregate: rosterOf(
          roster,
          pairs
            .filter((pair) => pair !== unsettled)
            .map(([low, high]) => settledSums(low.id, high.id)),
        ),
        votes: [],
        // the same number for every candidate, so only the weights differ
        random: randomFrom(0.5),
      });

      expect(pairOf(drawn)).toEqual(
        [unsettled[0].name, unsettled[1].name].sort(),
      );
    }
  });

  it("is exhausted with the Active Matchup count once every one is voted on", () => {
    const retired = element(5, "santa", { kind: "rare", isActive: false });
    const votes = [
      { elementLow: fire.id, elementHigh: water.id },
      { elementLow: fire.id, elementHigh: plant.id },
      { elementLow: water.id, elementHigh: plant.id },
      // the retired Element's Matchups are not counted, and not offered either
      { elementLow: fire.id, elementHigh: retired.id },
    ];

    const drawn = drawMatchup({
      aggregate: rosterOf([fire, water, plant, retired]),
      votes,
      random: randomFrom(0),
    });

    expect(drawn).toEqual({ state: "exhausted", matchupCount: 3 });
  });

  it("counts the Active Matchups of a roster too thin to make one", () => {
    const drawn = drawMatchup({
      aggregate: rosterOf([fire]),
      votes: [],
      random: randomFrom(0),
    });

    expect(drawn).toEqual({ state: "exhausted", matchupCount: 0 });
  });

  it("hands the browser the Elements as shown and nothing of their kind", () => {
    const drawn = drawMatchup({
      aggregate: rosterOf([fire, water]),
      votes: [],
      random: randomFrom(0.5),
    });

    if (drawn.state !== "matchup") throw new Error("nothing was offered");
    expect(drawn.top).not.toHaveProperty("kind");
    expect(drawn.bottom).not.toHaveProperty("kind");
  });

  it("flips a coin for which Element is on top", () => {
    const drawnWith = (flip: number) =>
      drawMatchup({
        aggregate: rosterOf([fire, water]),
        votes: [],
        random: randomFrom(0.5, flip),
      });

    expect(drawnWith(0.4)).toMatchObject({
      top: shownElementOf(fire),
      bottom: shownElementOf(water),
    });
    expect(drawnWith(0.6)).toMatchObject({
      top: shownElementOf(water),
      bottom: shownElementOf(fire),
    });
  });
});
