import { and, count, eq, sql, sum } from "drizzle-orm";
import { db } from "@/db/index.server";
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
  shownElementOf,
  type UnlockCounts,
} from "./showdown-stats";
import { type OwnVote, storiesOf } from "./showdown-stories";
import { createVoteLimiter } from "./vote-limiter";
import {
  noVotes,
  revealFor,
  type VoteCastResult,
  type VoteReveal,
} from "./vote-reveal";
import type { Voter } from "./voter-cookie";

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
const { readAggregate, forgetAggregate } = cacheAggregate(loadAggregate);

export const showdownAggregate = readAggregate;

// A visitor with no cookie has voted on nothing, so they are offered the whole
// roster's Matchups. Their own Votes are read fresh every time: the cache would
// offer them a Matchup they have just voted on.
export async function nextMatchup(
  voter: Voter | undefined,
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
async function votesBy(voter: Voter | undefined): Promise<OwnVote[]> {
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
// the two counts and how many tiles the mosaic has. The Voter's own Votes are
// read fresh, so their last one is in it.
export async function showdownStats(
  voter: Voter | undefined,
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
// round only. A Voter who votes on the same Matchup twice is not an error:
// their first Vote stands and the reveal is the crowd as it is now.
export async function castVote(
  voter: Voter,
  nowMs: number,
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

  // A repeat Vote stores nothing, so it leaves both counts where they were and
  // cannot be the Vote that crosses them.
  const inserted = await db
    .insert(votes)
    .values({
      voter,
      elementLow,
      elementHigh,
      value: topIsLow ? value : fromTheOtherSide(value),
    })
    .onConflictDoNothing({
      target: [votes.voter, votes.elementLow, votes.elementHigh],
    })
    .returning({ voter: votes.voter });

  // The split is read fresh for this one Matchup, never from the cache the
  // Stats read: the Voter's own Vote has to be in it. So are both unlock
  // numbers, which the cached copy is up to a minute too old to decide on.
  const [tally, [stood], [countsAfter]] = await Promise.all([
    db
      .select({ value: votes.value, voteCount: count() })
      .from(votes)
      .where(thisMatchup)
      .groupBy(votes.value),
    db
      .select({ value: votes.value })
      .from(votes)
      .where(and(thisMatchup, eq(votes.voter, voter))),
    db
      .select({
        everyVoteCount: count(),
        ownVoteCount:
          sql`count(*) filter (where ${votes.voter} = ${voter})`.mapWith(
            Number,
          ),
      })
      .from(votes),
  ]);
  if (!stood)
    throw new Error(
      `the Vote on Matchup ${elementLow}-${elementHigh} was cast but is not there to read back`,
    );
  if (!countsAfter)
    throw new Error("counting the Votes cast so far gave no row back");

  const counts = noVotes();
  for (const { value: stored, voteCount } of tally)
    counts[asShown(stored)] += voteCount;
  const reveal = revealFor(counts, asShown(stood.value));

  const countsBefore: UnlockCounts =
    inserted.length === 1
      ? {
          ownVoteCount: countsAfter.ownVoteCount - 1,
          everyVoteCount: countsAfter.everyVoteCount - 1,
        }
      : countsAfter;
  if (isStatsUnlocked(countsBefore) || !isStatsUnlocked(countsAfter))
    return reveal;

  // The Stats gate reads the cached count, which is a minute behind this Vote
  // at worst: the Voter who has just watched them open must not be dropped
  // onto the locked screen.
  forgetAggregate();
  const { elements: active } = await showdownAggregate(nowMs);
  return { ...reveal, unlockedElements: active.map(shownElementOf) };
}

// One cap per Machine, as the aggregate's cache is one copy per Machine.
const limitVote = createVoteLimiter();

// The whole of casting a Vote: the cap is counted first, so an address that has
// run past it stores nothing and reads nothing back.
export async function castVoteFromAddress(
  voter: Voter,
  address: string | undefined,
  nowMs: number,
  cast: VoteCast,
): Promise<VoteCastResult> {
  const limitedBy = limitVote(address, nowMs);
  if (limitedBy) return { state: "limited", window: limitedBy };
  return castVote(voter, nowMs, cast);
}
