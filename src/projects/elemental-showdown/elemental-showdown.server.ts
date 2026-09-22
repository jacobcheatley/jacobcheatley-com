import { and, count, eq } from "drizzle-orm";
import { db } from "@/db/index.server";
import { noVotes, revealFor, type VoteReveal } from "./matchup-score";
import { drawMatchup, type NextMatchup } from "./matchup-selection";
import { elements, votes } from "./schema";
import {
  type VoteCast,
  type VoteValue,
  voteValueSchema,
} from "./showdown-schema";

// A visitor with no cookie has voted on nothing, so they are offered the whole
// roster's Matchups.
export async function nextMatchup(
  voter: string | undefined,
  random: () => number,
): Promise<NextMatchup> {
  const [roster, cast] = await Promise.all([
    db.select().from(elements),
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
  return drawMatchup({ elements: roster, votes: cast, random });
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
