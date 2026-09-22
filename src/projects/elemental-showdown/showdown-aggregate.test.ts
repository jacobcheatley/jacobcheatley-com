import { describe, expect, it } from "vitest";
import { scoreMatchup } from "./matchup-score";
import type { ShowdownElement } from "./schema";
import {
  AGGREGATE_LIFETIME_MS,
  aggregateOf,
  cacheAggregate,
  type ShowdownAggregate,
} from "./showdown-aggregate";
import type { ElementKind } from "./showdown-schema";

const element = (
  id: number,
  name: string,
  {
    kind = "common",
    isActive = true,
  }: { kind?: ElementKind; isActive?: boolean } = {},
): ShowdownElement => ({
  id,
  name,
  emoji: "🔥",
  colour: "#f2541b",
  kind,
  isActive,
});

const fire = element(1, "fire");
const water = element(2, "water");
const santa = element(3, "santa", { kind: "rare", isActive: false });

const pairsOf = ({ matchups }: ShowdownAggregate) =>
  matchups.map(({ elementLow, elementHigh }) =>
    [elementLow.name, elementHigh.name].join(" v "),
  );

describe("aggregateOf", () => {
  it("scores every Active Matchup, voted on or not", () => {
    const aggregate = aggregateOf({
      elements: [fire, water, element(4, "plant")],
      matchupSums: [
        {
          elementLow: 1,
          elementHigh: 2,
          voteCount: 2,
          valueSum: 1,
          squareSum: 5,
        },
      ],
    });

    expect(pairsOf(aggregate)).toEqual([
      "fire v water",
      "fire v plant",
      "water v plant",
    ]);
    expect(aggregate.matchups[0]?.score).toEqual(
      scoreMatchup({ voteCount: 2, valueSum: 1, squareSum: 5 }),
    );
    expect(aggregate.matchups[1]?.score).toEqual(
      scoreMatchup({ voteCount: 0, valueSum: 0, squareSum: 0 }),
    );
  });

  it("leaves out the Matchups of an Element switched off", () => {
    const aggregate = aggregateOf({
      elements: [fire, water, santa],
      matchupSums: [],
    });

    expect(aggregate.elements).toEqual([fire, water]);
    expect(pairsOf(aggregate)).toEqual(["fire v water"]);
  });

  it("counts every Vote, on an Active Matchup or not", () => {
    const aggregate = aggregateOf({
      elements: [fire, water, santa],
      matchupSums: [
        {
          elementLow: 1,
          elementHigh: 2,
          voteCount: 2,
          valueSum: 0,
          squareSum: 2,
        },
        {
          elementLow: 1,
          elementHigh: 3,
          voteCount: 7,
          valueSum: 7,
          squareSum: 7,
        },
      ],
    });

    expect(aggregate.everyVoteCount).toBe(9);
  });

  it("puts the Matchups the Elements' ids way round, whatever order the roster arrives in", () => {
    const aggregate = aggregateOf({
      elements: [water, fire],
      matchupSums: [],
    });

    expect(pairsOf(aggregate)).toEqual(["fire v water"]);
  });
});

describe("cacheAggregate", () => {
  const loadCounting = () => {
    let loadCount = 0;
    const load = () => {
      loadCount++;
      return Promise.resolve(
        aggregateOf({ elements: [fire, water], matchupSums: [] }),
      );
    };
    return { load, loaded: () => loadCount };
  };

  it("loads once however many times it is read inside the lifetime", async () => {
    const { load, loaded } = loadCounting();
    const aggregate = cacheAggregate(load);

    await aggregate(1_000);
    await aggregate(1_000 + AGGREGATE_LIFETIME_MS - 1);

    expect(loaded()).toBe(1);
  });

  it("loads again on the first read after the lifetime is up", async () => {
    const { load, loaded } = loadCounting();
    const aggregate = cacheAggregate(load);

    await aggregate(1_000);
    await aggregate(1_000 + AGGREGATE_LIFETIME_MS);

    expect(loaded()).toBe(2);
  });

  it("holds nothing when the load fails, so the next read tries again", async () => {
    let attempt = 0;
    const aggregate = cacheAggregate(() => {
      attempt++;
      return attempt === 1
        ? Promise.reject(new Error("the database said no"))
        : Promise.resolve(aggregateOf({ elements: [fire], matchupSums: [] }));
    });

    await expect(aggregate(1_000)).rejects.toThrow("the database said no");

    expect(await aggregate(1_000)).toMatchObject({ elements: [fire] });
  });
});
