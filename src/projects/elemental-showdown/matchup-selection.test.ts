import { describe, expect, it } from "vitest";
import { drawMatchup } from "./matchup-selection";
import type { ShowdownElement } from "./schema";

const element = (
  id: number,
  name: string,
  isActive = true,
): ShowdownElement => ({
  id,
  name,
  emoji: "🔥",
  colour: "#f2541b",
  kind: "common",
  isActive,
});

const fire = element(1, "fire");
const water = element(2, "water");
const plant = element(3, "plant");

// Every draw takes its numbers in order; a source that runs dry keeps handing
// out the last one, so a test only names the numbers it cares about.
const randomFrom = (...numbers: number[]) => {
  let at = 0;
  return () => numbers[Math.min(at++, numbers.length - 1)] ?? 0;
};

// Which Element is on top is a coin flip, so a Matchup is read as a pair.
const pairOf = (drawn: ReturnType<typeof drawMatchup>) =>
  drawn.state === "matchup"
    ? [drawn.top.name, drawn.bottom.name].sort()
    : ["exhausted"];

describe("drawMatchup", () => {
  it("never offers a Matchup this Voter has voted on", () => {
    const votes = [
      { elementLow: fire.id, elementHigh: water.id },
      { elementLow: fire.id, elementHigh: plant.id },
    ];

    for (const draw of [0, 0.5, 0.99]) {
      const drawn = drawMatchup({
        elements: [fire, water, plant],
        votes,
        random: randomFrom(draw),
      });

      expect(pairOf(drawn)).toEqual(["plant", "water"]);
    }
  });

  it("never offers a Matchup with an Element switched off", () => {
    const retired = element(3, "santa", false);

    for (const draw of [0, 0.5, 0.99]) {
      const drawn = drawMatchup({
        elements: [fire, water, retired],
        votes: [],
        random: randomFrom(draw),
      });

      expect(pairOf(drawn)).toEqual(["fire", "water"]);
    }
  });

  it("offers every Active Matchup a Voter with no Votes has seen nothing of", () => {
    const seen = [0, 0.4, 0.9].map((draw) =>
      pairOf(
        drawMatchup({
          elements: [fire, water, plant],
          votes: [],
          random: randomFrom(draw),
        }),
      ).join(" v "),
    );

    expect(new Set(seen)).toEqual(
      new Set(["fire v water", "fire v plant", "plant v water"]),
    );
  });

  it("is exhausted with the Active Matchup count once every one is voted on", () => {
    const retired = element(4, "santa", false);
    const votes = [
      { elementLow: fire.id, elementHigh: water.id },
      { elementLow: fire.id, elementHigh: plant.id },
      { elementLow: water.id, elementHigh: plant.id },
      // the retired Element's Matchups are not counted, and not offered either
      { elementLow: fire.id, elementHigh: retired.id },
    ];

    const drawn = drawMatchup({
      elements: [fire, water, plant, retired],
      votes,
      random: randomFrom(0),
    });

    expect(drawn).toEqual({ state: "exhausted", matchupCount: 3 });
  });

  it("counts the Active Matchups of a roster too thin to make one", () => {
    const drawn = drawMatchup({
      elements: [fire],
      votes: [],
      random: randomFrom(0),
    });

    expect(drawn).toEqual({ state: "exhausted", matchupCount: 0 });
  });

  it("flips a coin for which Element is on top", () => {
    const drawnWith = (flip: number) =>
      drawMatchup({
        elements: [fire, water],
        votes: [],
        random: randomFrom(0, flip),
      });

    expect(drawnWith(0.4)).toMatchObject({ top: fire, bottom: water });
    expect(drawnWith(0.6)).toMatchObject({ top: water, bottom: fire });
  });
});
