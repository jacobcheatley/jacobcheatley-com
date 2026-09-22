import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import {
  castVote,
  castVoteFromAddress,
  nextMatchup,
  showdownAggregate,
  showdownStats,
} from "./elemental-showdown.server";
import { scoreMatchup } from "./matchup-score";
import { elements, votes } from "./schema";
import { AGGREGATE_LIFETIME_MS } from "./showdown-aggregate";
import type { ElementKind, VoteValue } from "./showdown-schema";
import { EVERY_VOTES_TO_UNLOCK, OWN_VOTES_TO_UNLOCK } from "./showdown-stats";
import { VOTES_PER_MINUTE } from "./vote-limiter";
import { mintVoter, voterSchema } from "./voter-cookie";

// A Voter whose uuid a test can tell from another at a glance.
const voterOf = (uuid: string) => voterSchema.parse(uuid);

const VOTER = voterOf("11111111-1111-4111-8111-111111111111");
const OTHER_VOTER = voterOf("22222222-2222-4222-8222-222222222222");

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

type Matchup = { elementLow: number; elementHigh: number };

const A_WEAK_WIN: VoteValue = 1;

// Seven Elements give 21 Matchups, more than the Voter's own number, so each
// of their Votes below is on a Matchup of its own.
const ELEMENTS_FOR_THE_GATE = 7;

async function insertMatchups(elementCount: number) {
  const ids: number[] = [];
  for (let at = 0; at < elementCount; at++)
    ids.push(await insertElement(`element ${at}`));
  return ids.flatMap((elementLow, at) =>
    ids.slice(at + 1).map((elementHigh) => ({ elementLow, elementHigh })),
  );
}

// The Voter takes a Matchup each; the rest of the crowd piles onto the first
// of them, one Voter apiece so that every Vote stands.
async function castVotes(
  matchups: Matchup[],
  { own, everyone }: { own: number; everyone: number },
) {
  const [crowded] = matchups;
  if (!crowded) throw new Error("no Matchup to vote on");
  await db.insert(votes).values([
    ...matchups
      .slice(0, own)
      .map((matchup) => ({ voter: VOTER, ...matchup, value: A_WEAK_WIN })),
    ...Array.from({ length: everyone - own }, () => ({
      voter: mintVoter(),
      ...crowded,
      value: A_WEAK_WIN,
    })),
  ]);
}

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

describe("the Vote that unlocks the Stats", () => {
  // Both numbers one Vote short, with a Matchup left for the Voter to cast the
  // Vote that crosses them on.
  async function oneVoteShortOfBoth() {
    const matchups = await insertMatchups(ELEMENTS_FOR_THE_GATE);
    await castVotes(matchups, {
      own: OWN_VOTES_TO_UNLOCK - 1,
      everyone: EVERY_VOTES_TO_UNLOCK - 1,
    });
    return {
      matchups,
      unlocking: theVoteOn(matchups, OWN_VOTES_TO_UNLOCK - 1),
    };
  }

  function theVoteOn(matchups: Matchup[], at: number) {
    const unvoted = matchups[at];
    if (!unvoted) throw new Error(`no Matchup ${at} to vote on`);
    return {
      topElementId: unvoted.elementLow,
      bottomElementId: unvoted.elementHigh,
      value: A_WEAK_WIN,
    };
  }

  it("carries the Active Elements the wave flips a tile for", async () => {
    const { unlocking } = await oneVoteShortOfBoth();

    const reveal = await castVote(VOTER, unlocking);

    expect(reveal.unlockedElements).toHaveLength(ELEMENTS_FOR_THE_GATE);
    expect(reveal.unlockedElements?.[0]).toEqual({
      id: expect.any(Number),
      name: "element 0",
      emoji: "🔥",
      colour: "#f2541b",
    });
  });

  it("says nothing of an unlock on the Vote before both numbers are met", async () => {
    const matchups = await insertMatchups(ELEMENTS_FOR_THE_GATE);
    await castVotes(matchups, {
      own: OWN_VOTES_TO_UNLOCK - 2,
      everyone: EVERY_VOTES_TO_UNLOCK - 2,
    });

    const reveal = await castVote(
      VOTER,
      theVoteOn(matchups, OWN_VOTES_TO_UNLOCK - 2),
    );

    expect(reveal.unlockedElements).toBeUndefined();
  });

  it("says nothing of an unlock on the Vote after it", async () => {
    const { matchups, unlocking } = await oneVoteShortOfBoth();
    await castVote(VOTER, unlocking);

    const reveal = await castVote(
      VOTER,
      theVoteOn(matchups, OWN_VOTES_TO_UNLOCK),
    );

    expect(reveal.unlockedElements).toBeUndefined();
  });

  it("says nothing of an unlock on a repeat Vote that stored nothing", async () => {
    const { unlocking } = await oneVoteShortOfBoth();
    await castVote(VOTER, unlocking);

    const reveal = await castVote(VOTER, unlocking);

    expect(reveal.unlockedElements).toBeUndefined();
  });

  it("opens the Stats to the Voter the moment their unlocking Vote lands", async () => {
    const { unlocking } = await oneVoteShortOfBoth();
    // The locked screen the Voter is reading holds the crowd's number for a
    // minute, and their unlocking Vote arrives inside it.
    const whileHeldMs = nextRead();
    expect(await showdownStats(VOTER, whileHeldMs)).toMatchObject({
      state: "locked",
    });

    await castVote(VOTER, unlocking);

    expect(await showdownStats(VOTER, whileHeldMs)).toMatchObject({
      state: "unlocked",
    });
  });
});

// The limiter is one per Machine, so each test here brings an address of its
// own rather than spending another test's cap.
describe("castVoteFromAddress", () => {
  it("reveals the crowd as ever to an address within its cap", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");

    const cast = await castVoteFromAddress(VOTER, "203.0.113.1", 0, {
      topElementId: fire,
      bottomElementId: water,
      value: 2,
    });

    expect(cast).toMatchObject({ state: "reveal", vote: 2 });
  });

  it("stores no Vote once the address has spent the minute's cap", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const plant = await insertElement("plant");
    const address = "203.0.113.2";
    for (let cast = 0; cast < VOTES_PER_MINUTE; cast++)
      await castVoteFromAddress(VOTER, address, 0, {
        topElementId: fire,
        bottomElementId: water,
        value: 1,
      });

    const cast = await castVoteFromAddress(VOTER, address, 0, {
      topElementId: fire,
      bottomElementId: plant,
      value: 2,
    });

    expect(cast).toEqual({ state: "limited", window: "minute" });
    expect(await storedVotes()).toMatchObject([
      { elementLow: fire, elementHigh: water },
    ]);
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

describe("showdownStats", () => {
  // The gate is met exactly, so every test below reads the open Stats.
  async function unlockFor(elementCount: number) {
    const matchups = await insertMatchups(elementCount);
    await castVotes(matchups, {
      own: OWN_VOTES_TO_UNLOCK,
      everyone: EVERY_VOTES_TO_UNLOCK,
    });
    const [judged] = matchups;
    if (!judged) throw new Error("no Matchup to vote on");
    return { matchups, anElement: judged.elementLow };
  }

  async function openStats() {
    const stats = await showdownStats(VOTER, nextRead());
    if (stats.state !== "unlocked")
      throw new Error("the Stats were expected to be open");
    return stats;
  }

  it("opens the Stats once both numbers are met exactly", async () => {
    await unlockFor(ELEMENTS_FOR_THE_GATE);

    expect(await openStats()).toMatchObject({ state: "unlocked" });
  });

  it("hands over every Active Element and nothing of its kind", async () => {
    await unlockFor(ELEMENTS_FOR_THE_GATE);

    const { elements: shown } = await openStats();

    expect(shown).toHaveLength(ELEMENTS_FOR_THE_GATE);
    expect(shown[0]).toEqual({
      id: expect.any(Number),
      name: "element 0",
      emoji: "🔥",
      colour: "#f2541b",
    });
  });

  it("calls every Matchup the crowd has judged and none it has not", async () => {
    // The Voter's own Votes are one Matchup each, and the crowd piles onto the
    // first of them, so every Matchup but the last is judged.
    const { matchups } = await unlockFor(ELEMENTS_FOR_THE_GATE);

    const called = await openStats();

    expect(called.matchups).toHaveLength(OWN_VOTES_TO_UNLOCK);
    expect(matchups).toHaveLength(OWN_VOTES_TO_UNLOCK + 1);
    expect(called.matchups[0]).toMatchObject({
      effectiveness: "2×",
      confidence: "solid",
    });
  });

  it("takes a switched-off Element and its Matchups out of the open Stats", async () => {
    const { anElement } = await unlockFor(ELEMENTS_FOR_THE_GATE);
    await db
      .update(elements)
      .set({ isActive: false })
      .where(eq(elements.id, anElement));

    const closed = await openStats();

    expect(closed.elements.map(({ id }) => id)).not.toContain(anElement);
    expect(
      closed.matchups.filter(
        ({ elementLow, elementHigh }) =>
          elementLow === anElement || elementHigh === anElement,
      ),
    ).toEqual([]);
  });

  it("brings a switched-off Element and its Matchups back when it returns", async () => {
    const { anElement } = await unlockFor(ELEMENTS_FOR_THE_GATE);
    await db
      .update(elements)
      .set({ isActive: false })
      .where(eq(elements.id, anElement));
    await openStats();
    await db
      .update(elements)
      .set({ isActive: true })
      .where(eq(elements.id, anElement));

    const reopened = await openStats();

    expect(reopened.elements.map(({ id }) => id)).toContain(anElement);
    expect(
      reopened.matchups.filter(
        ({ elementLow, elementHigh }) =>
          elementLow === anElement || elementHigh === anElement,
      ),
    ).not.toEqual([]);
  });

  // Enough Votes the same way round that the crowd is sure of the call, so the
  // Matchup is settled enough to feed a Story.
  const VOTES_THAT_SETTLE_A_MATCHUP = 20;

  it("tells no Story about a switched-off Element", async () => {
    // The crowd piles onto the first Matchup, so the last one needs a crowd of
    // its own before it can feed a Story. Both Elements then hold one win, and
    // the tie goes to the alphabetically first — the one switched off here.
    const { matchups, anElement } = await unlockFor(ELEMENTS_FOR_THE_GATE);
    const theOther = matchups.at(-1);
    if (!theOther) throw new Error("no Matchup to vote on");
    await db.insert(votes).values(
      Array.from({ length: VOTES_THAT_SETTLE_A_MATCHUP }, () => ({
        voter: mintVoter(),
        ...theOther,
        value: A_WEAK_WIN,
      })),
    );
    await db
      .update(elements)
      .set({ isActive: false })
      .where(eq(elements.id, anElement));

    const { stories } = await openStats();

    expect(stories).toContainEqual(
      expect.objectContaining({
        kind: "champion",
        element: expect.objectContaining({ id: theOther.elementLow }),
      }),
    );
  });

  it("reads the Voter's own Votes into the Story about them", async () => {
    // Every Vote of theirs went the way the crowd went.
    await unlockFor(ELEMENTS_FOR_THE_GATE);

    const { stories } = await openStats();

    expect(stories).toContainEqual(
      expect.objectContaining({
        kind: "you",
        record: expect.objectContaining({ withTheCrowdShare: 1 }),
      }),
    );
  });

  it("sends a Voter one Vote short of the crowd's number the counts and nothing else", async () => {
    const matchups = await insertMatchups(ELEMENTS_FOR_THE_GATE);
    await castVotes(matchups, {
      own: OWN_VOTES_TO_UNLOCK,
      everyone: EVERY_VOTES_TO_UNLOCK - 1,
    });

    expect(await showdownStats(VOTER, nextRead())).toEqual({
      state: "locked",
      ownVoteCount: OWN_VOTES_TO_UNLOCK,
      everyVoteCount: EVERY_VOTES_TO_UNLOCK - 1,
      elementCount: ELEMENTS_FOR_THE_GATE,
    });
  });

  it("keeps them locked while the Voter is one Vote short of their own number", async () => {
    const matchups = await insertMatchups(ELEMENTS_FOR_THE_GATE);
    await castVotes(matchups, {
      own: OWN_VOTES_TO_UNLOCK - 1,
      everyone: EVERY_VOTES_TO_UNLOCK,
    });

    expect(await showdownStats(VOTER, nextRead())).toMatchObject({
      state: "locked",
      ownVoteCount: OWN_VOTES_TO_UNLOCK - 1,
    });
  });

  it("counts the Votes on a switched-off Element in everyone's number", async () => {
    const fire = await insertElement("fire");
    const santa = await insertElement("santa", {
      kind: "rare",
      isActive: false,
    });
    await castVotes([{ elementLow: fire, elementHigh: santa }], {
      own: 0,
      everyone: EVERY_VOTES_TO_UNLOCK,
    });

    expect(await showdownStats(VOTER, nextRead())).toMatchObject({
      everyVoteCount: EVERY_VOTES_TO_UNLOCK,
      elementCount: 1,
    });
  });

  it("has nothing of its own to count for a visitor with no cookie", async () => {
    const matchups = await insertMatchups(ELEMENTS_FOR_THE_GATE);
    await castVotes(matchups, {
      own: OWN_VOTES_TO_UNLOCK,
      everyone: EVERY_VOTES_TO_UNLOCK,
    });

    expect(await showdownStats(undefined, nextRead())).toMatchObject({
      state: "locked",
      ownVoteCount: 0,
    });
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
