import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import {
  castVote,
  nextMatchup,
  showdownAggregate,
} from "./elemental-showdown.server";
import { scoreMatchup } from "./matchup-score";
import { elements, votes } from "./schema";
import { AGGREGATE_LIFETIME_MS } from "./showdown-aggregate";
import type { ElementKind } from "./showdown-schema";

const VOTER = "11111111-1111-4111-8111-111111111111";
const OTHER_VOTER = "22222222-2222-4222-8222-222222222222";

// The aggregate is held for a minute, so every read here is a minute on from
// the last: no test is handed the Elements and Votes of the one before it.
let readAtMs = 0;
const nextRead = () => (readAtMs += AGGREGATE_LIFETIME_MS);

async function insertElement(
  name: string,
  {
    kind = "common",
    isActive = true,
  }: { kind?: ElementKind; isActive?: boolean } = {},
) {
  const [element] = await db
    .insert(elements)
    .values({ name, emoji: "🔥", colour: "#f2541b", kind, isActive })
    .returning({ id: elements.id });
  if (!element) throw new Error("insert returned no row");
  return element.id;
}

const storedVotes = () => db.select().from(votes);

describe("castVote", () => {
  it("stores a Vote cast with the higher-id Element on top the way round the Matchup is kept, sign and all", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");

    // water is on top and crushes fire, so fire — the lower id — loses by two
    await castVote(VOTER, {
      topElementId: water,
      bottomElementId: fire,
      value: 2,
    });

    expect(await storedVotes()).toMatchObject([
      { voter: VOTER, elementLow: fire, elementHigh: water, value: -2 },
    ]);
  });

  it("stores a Vote cast with the lower-id Element on top as it was read", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");

    await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 1,
    });

    expect(await storedVotes()).toMatchObject([
      { elementLow: fire, elementHigh: water, value: 1 },
    ]);
  });

  it("leaves too close to call the same read from either side", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");

    await castVote(VOTER, {
      topElementId: water,
      bottomElementId: fire,
      value: 0,
    });

    expect(await storedVotes()).toMatchObject([{ value: 0 }]);
  });

  it("lets the Voter's first Vote on a Matchup stand, without an error on the second", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 2,
    });

    await castVote(VOTER, {
      topElementId: water,
      bottomElementId: fire,
      value: 1,
    });

    expect(await storedVotes()).toMatchObject([{ value: 2 }]);
  });

  it("counts the Vote just cast in the reveal it hands back", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");

    const reveal = await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 2,
    });

    expect(reveal).toMatchObject({
      state: "reveal",
      counts: { "2": 1 },
      vote: 2,
      sameShare: 1,
      headline: "first",
    });
  });

  it("reveals the Matchup from the side it was shown, whichever Element is on top", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    // fire crushes water, from fire's side: the Matchup's own way round
    await castVote(OTHER_VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 2,
    });

    // this Voter is shown water on top, and gives fire a weak win from there
    const reveal = await castVote(VOTER, {
      topElementId: water,
      bottomElementId: fire,
      value: -1,
    });

    expect(reveal).toMatchObject({
      counts: { "-2": 1, "-1": 1, "0": 0, "1": 0, "2": 0 },
      vote: -1,
    });
  });

  it("reveals the Matchup again on a repeat Vote, showing the Vote that stands", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const matchup = { topElementId: fire, bottomElementId: water };
    await castVote(VOTER, { ...matchup, value: 2 });

    const reveal = await castVote(VOTER, { ...matchup, value: 1 });

    expect(reveal).toMatchObject({
      state: "reveal",
      counts: { "1": 0, "2": 1 },
      vote: 2,
    });
  });

  it("keeps one Vote per Voter, so another Voter's verdict on the same Matchup is its own", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const matchup = { topElementId: fire, bottomElementId: water };

    await castVote(VOTER, { ...matchup, value: 2 });
    await castVote(OTHER_VOTER, { ...matchup, value: -1 });

    expect(await storedVotes()).toHaveLength(2);
  });
});

describe("showdownAggregate", () => {
  it("adds up the three sums of every Vote on a Matchup", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const matchup = { topElementId: fire, bottomElementId: water };
    await castVote(VOTER, { ...matchup, value: 2 });
    await castVote(OTHER_VOTER, { ...matchup, value: -1 });

    const { matchups } = await showdownAggregate(nextRead());

    expect(matchups).toMatchObject([
      {
        elementLow: { id: fire },
        elementHigh: { id: water },
        score: scoreMatchup({ voteCount: 2, valueSum: 1, squareSum: 5 }),
      },
    ]);
  });

  it("counts the Votes of a switched-off Element in every Vote cast", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const santa = await insertElement("santa", {
      kind: "rare",
      isActive: false,
    });
    await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: santa,
      value: 1,
    });
    await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 1,
    });

    const aggregate = await showdownAggregate(nextRead());

    expect(aggregate.everyVoteCount).toBe(2);
    expect(aggregate.matchups).toHaveLength(1);
  });

  it("brings a switched-off Element's Votes back with it", async () => {
    const fire = await insertElement("fire");
    const santa = await insertElement("santa", {
      kind: "rare",
      isActive: false,
    });
    await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: santa,
      value: 2,
    });
    await db
      .update(elements)
      .set({ isActive: true })
      .where(eq(elements.id, santa));

    const { matchups } = await showdownAggregate(nextRead());

    expect(matchups).toMatchObject([
      { score: scoreMatchup({ voteCount: 1, valueSum: 2, squareSum: 4 }) },
    ]);
  });
});

describe("nextMatchup", () => {
  const always = (draw: number) => () => draw;

  it("offers a visitor with no cookie a Matchup they have seen nothing of", async () => {
    await insertElement("fire");
    await insertElement("water");

    const drawn = await nextMatchup(undefined, always(0), nextRead());

    expect(drawn.state).toBe("matchup");
  });

  it("leaves a switched-off Element out of the draw and offers it again once it is back", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const santa = await insertElement("santa", {
      kind: "rare",
      isActive: false,
    });
    await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 0,
    });
    expect(await nextMatchup(VOTER, always(0), nextRead())).toMatchObject({
      state: "exhausted",
    });

    await db
      .update(elements)
      .set({ isActive: true })
      .where(eq(elements.id, santa));

    const drawn = await nextMatchup(VOTER, always(0), nextRead());

    if (drawn.state !== "matchup") throw new Error("nothing was offered");
    expect([drawn.top.id, drawn.bottom.id]).toContain(santa);
  });

  it("leaves out the Matchups this Voter has already voted on", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const plant = await insertElement("plant");
    await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 2,
    });

    for (const draw of [0, 0.5, 0.99]) {
      const drawn = await nextMatchup(VOTER, always(draw), nextRead());

      if (drawn.state !== "matchup") throw new Error("nothing was offered");
      expect([drawn.top.id, drawn.bottom.id].sort()).not.toEqual(
        [fire, water].sort(),
      );
      expect([drawn.top.id, drawn.bottom.id]).toContain(plant);
    }
  });

  it("says how many Active Matchups there are once the Voter has judged them all", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    await insertElement("santa", { kind: "rare", isActive: false });
    await castVote(VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 0,
    });

    expect(await nextMatchup(VOTER, always(0), nextRead())).toEqual({
      state: "exhausted",
      matchupCount: 1,
    });
  });

  it("does not hold another Voter's Votes against this one", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    await castVote(OTHER_VOTER, {
      topElementId: fire,
      bottomElementId: water,
      value: 2,
    });

    expect((await nextMatchup(VOTER, always(0), nextRead())).state).toBe(
      "matchup",
    );
  });
});
