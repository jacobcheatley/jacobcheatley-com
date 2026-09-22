import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import { castVote, nextMatchup } from "./elemental-showdown.server";
import { elements, votes } from "./schema";
import type { ElementKind } from "./showdown-schema";

const VOTER = "11111111-1111-4111-8111-111111111111";
const OTHER_VOTER = "22222222-2222-4222-8222-222222222222";

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

  it("keeps one Vote per Voter, so another Voter's verdict on the same Matchup is its own", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const matchup = { topElementId: fire, bottomElementId: water };

    await castVote(VOTER, { ...matchup, value: 2 });
    await castVote(OTHER_VOTER, { ...matchup, value: -1 });

    expect(await storedVotes()).toHaveLength(2);
  });
});

describe("nextMatchup", () => {
  const always = (draw: number) => () => draw;

  it("offers a visitor with no cookie a Matchup they have seen nothing of", async () => {
    await insertElement("fire");
    await insertElement("water");

    const drawn = await nextMatchup(undefined, always(0));

    expect(drawn.state).toBe("matchup");
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
      const drawn = await nextMatchup(VOTER, always(draw));

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

    expect(await nextMatchup(VOTER, always(0))).toEqual({
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

    expect((await nextMatchup(VOTER, always(0))).state).toBe("matchup");
  });
});
