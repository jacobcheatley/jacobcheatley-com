import { eq } from "drizzle-orm";
import { db } from "@/db/index.server";
import { drawMatchup, type NextMatchup } from "./matchup-selection";
import { elements, votes } from "./schema";
import { type VoteCast, voteValueSchema } from "./showdown-schema";

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

// The Tug reads a Vote from the top Element's side; a Matchup is stored one way
// round only, so a Vote cast with the higher-id Element on top comes in with
// its sign flipped. A Voter who votes on the same Matchup twice (two tabs, a
// double submit) is not an error: their first Vote stands.
export async function castVote(
  voter: string,
  { topElementId, bottomElementId, value }: VoteCast,
) {
  const topIsLow = topElementId < bottomElementId;
  await db
    .insert(votes)
    .values({
      voter,
      elementLow: topIsLow ? topElementId : bottomElementId,
      elementHigh: topIsLow ? bottomElementId : topElementId,
      value: topIsLow ? value : voteValueSchema.parse(-value),
    })
    .onConflictDoNothing({
      target: [votes.voter, votes.elementLow, votes.elementHigh],
    });
}
