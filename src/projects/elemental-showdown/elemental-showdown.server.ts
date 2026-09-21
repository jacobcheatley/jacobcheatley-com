import { and, count, eq, sql, sum } from "drizzle-orm";
import { db } from "@/db/index.server";
import {
  noVotes,
  revealFor,
  type VoteCastResult,
  type VoteReveal,
} from "./matchup-score";
import { drawMatchup, type NextMatchup } from "./matchup-selection";
import { elements, votes } from "./schema";
import {
  aggregateOf,
  cacheAggregate,
  type ShowdownAggregate,
} from "./showdown-aggregate";
import {
  type VoteCast,
  type VoteValue,
  voteValueSchema,
} from "./showdown-schema";
import {
  crowdCallsOf,
  isStatsUnlocked,
  type ShowdownStats,
  type UnlockCounts,
} from "./showdown-stats";
import { type OwnVote, storiesOf } from "./showdown-stories";
import { createVoteLimiter } from "./vote-limiter";

// The roster and the three sums of every voted Matchup, in two queries. A
// Matchup nobody has voted on has no row here and is scored from the prior.
async function loadAggregate(): Promise<ShowdownAggregate> {
  const [roster, matchupSums] = await Promise.all([
    db.select().from(elements),
    db
      .select({
        elementLow: votes.elementLow,
        elementHigh: votes.elementHigh,
        voteCount: count(),
        valueSum: sum(votes.value).mapWith(Number),
        squareSum: sql`sum(${votes.value} * ${votes.value})`.mapWith(Number),
      })
      .from(votes)
      .groupBy(votes.elementLow, votes.elementHigh),
  ]);
  return aggregateOf({ elements: roster, matchupSums });
}

// One copy per Machine: a suspended Machine wakes with an empty cache and a
// second Machine holds its own, both of which the Project can live with.
export const showdownAggregate = cacheAggregate(loadAggregate);

// A visitor with no cookie has voted on nothing, so they are offered the whole
// roster's Matchups. Their own Votes are read fresh every time: the cache would
// offer them a Matchup they have just voted on.
export async function nextMatchup(
  voter: string | undefined,
  random: () => number,
  nowMs: number,
): Promise<NextMatchup> {
  const [aggregate, cast] = await Promise.all([
    showdownAggregate(nowMs),
    voter
      ? db
          .select({
            elementLow: votes.elementLow,
            elementHigh: votes.elementHigh,
          })
          .from(votes)
          .where(eq(votes.voter, voter))
      : [],
  ]);
  return drawMatchup({ aggregate, votes: cast, random });
}

// A visitor with no cookie has cast nothing, so there is nothing to ask for.
// The gate counts these and the "you" Story reads their values, both of which
// the cached aggregate is too old to know.
async function votesBy(voter: string | undefined): Promise<OwnVote[]> {
  if (!voter) return [];
  return db
    .select({
      elementLow: votes.elementLow,
      elementHigh: votes.elementHigh,
      value: votes.value,
    })
    .from(votes)
    .where(eq(votes.voter, voter));
}

// The gate is the server's: while it holds, the only things to leave here are
// the two counts and how many tiles the mosaic has. The crowd's number comes
// from the cached aggregate and the Voter's own Votes are always fresh, so
// their last one is in it.
export async function showdownStats(
  voter: string | undefined,
  nowMs: number,
): Promise<ShowdownStats> {
  const [aggregate, ownVotes] = await Promise.all([
    showdownAggregate(nowMs),
    votesBy(voter),
  ]);
  const counts: UnlockCounts = {
    ownVoteCount: ownVotes.length,
    everyVoteCount: aggregate.everyVoteCount,
  };
  if (isStatsUnlocked(counts))
    return {
      state: "unlocked",
      ...crowdCallsOf(aggregate),
      stories: storiesOf(aggregate, ownVotes),
    };
  return {
    state: "locked",
    ...counts,
    elementCount: aggregate.elements.length,
  };
}

// A Matchup is stored from the lower-id Element's side and shown from the top
// Element's, so when the higher-id Element is on top every Vote of it reads
// with its sign flipped, going either way.
const fromTheOtherSide = (value: VoteValue) => voteValueSchema.parse(-value);

// The Tug reads a Vote from the top Element's side; a Matchup is stored one way
// round only. A Voter who votes on the same Matchup twice (two tabs, a double
// submit) is not an error: their first Vote stands, and the reveal is the
// crowd as it is now, read back from the Matchup's own side.
export async function castVote(
  voter: string,
  { topElementId, bottomElementId, value }: VoteCast,
): Promise<VoteReveal> {
  const topIsLow = topElementId < bottomElementId;
  const elementLow = topIsLow ? topElementId : bottomElementId;
  const elementHigh = topIsLow ? bottomElementId : topElementId;
  const asShown = (stored: VoteValue) =>
    topIsLow ? stored : fromTheOtherSide(stored);
  const thisMatchup = and(
    eq(votes.elementLow, elementLow),
    eq(votes.elementHigh, elementHigh),
  );

  await db
    .insert(votes)
    .values({
      voter,
      elementLow,
      elementHigh,
      value: topIsLow ? value : fromTheOtherSide(value),
    })
    .onConflictDoNothing({
      target: [votes.voter, votes.elementLow, votes.elementHigh],
    });

  // The split is read fresh for this one Matchup, never from the cache the
  // Stats read: the Voter's own Vote has to be in it.
  const [tally, [stood]] = await Promise.all([
    db
      .select({ value: votes.value, voteCount: count() })
      .from(votes)
      .where(thisMatchup)
      .groupBy(votes.value),
    db
      .select({ value: votes.value })
      .from(votes)
      .where(and(thisMatchup, eq(votes.voter, voter))),
  ]);
  if (!stood)
    throw new Error(
      `the Vote on Matchup ${elementLow}-${elementHigh} was cast but is not there to read back`,
    );

  const counts = noVotes();
  for (const { value: stored, voteCount } of tally)
    counts[asShown(stored)] += voteCount;
  return revealFor(counts, asShown(stood.value));
}

// One cap per Machine, as the aggregate's cache is one copy per Machine.
const limitVote = createVoteLimiter();

// The whole of casting a Vote: the cap is counted first, so an address that has
// run past it stores nothing and reads nothing back.
export async function castVoteFromAddress(
  voter: string,
  address: string | undefined,
  nowMs: number,
  cast: VoteCast,
): Promise<VoteCastResult> {
  const limitedBy = limitVote(address, nowMs);
  if (limitedBy) return { state: "limited", window: limitedBy };
  return castVote(voter, cast);
}
