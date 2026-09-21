import type { ShowdownElement } from "./schema";
import {
  matchupKey,
  type ScoredMatchup,
  type ShowdownAggregate,
} from "./showdown-aggregate";

// A Matchup as it is shown: which Element is on top is the draw's coin flip.
export type Matchup = { top: ShowdownElement; bottom: ShowdownElement };

export type NextMatchup =
  | ({ state: "matchup" } & Matchup)
  | { state: "exhausted"; matchupCount: number };

// One Vote of this Voter's, read only for the Matchup it settles.
export type VotedMatchup = { elementLow: number; elementHigh: number };

// How many Votes a Voter casts on Matchups between two Common Elements before
// the rest of the roster opens up: long enough to start on Matchups everyone
// has an opinion on.
const OPENING_COMMON_VOTES = 5;

// Efraimidis–Spirakis: one key per candidate from one number in [0, 1), the
// smallest key wins, and a candidate holds the smallest as often as its share
// of the weight.
const drawKey = (weight: number, draw: number) => -Math.log(1 - draw) / weight;

// The next Matchup for this Voter: the Active Matchups they have not voted on,
// weighted by how little the crowd has settled each one.
export function drawMatchup({
  aggregate,
  votes,
  random,
}: {
  aggregate: ShowdownAggregate;
  votes: VotedMatchup[];
  random: () => number;
}): NextMatchup {
  const voted = new Set(
    votes.map((vote) => matchupKey(vote.elementLow, vote.elementHigh)),
  );
  const unvoted = aggregate.matchups.filter(
    (matchup) =>
      !voted.has(matchupKey(matchup.elementLow.id, matchup.elementHigh.id)),
  );
  const opening =
    votes.length < OPENING_COMMON_VOTES
      ? unvoted.filter(
          ({ elementLow, elementHigh }) =>
            elementLow.kind === "common" && elementHigh.kind === "common",
        )
      : [];
  // A roster with no Common Matchup left to offer still has Matchups: the
  // opening gives way rather than calling a new Voter's run done.
  const pool = opening.length > 0 ? opening : unvoted;

  let drawn: ScoredMatchup | undefined;
  let lowestKey = Number.POSITIVE_INFINITY;
  for (const matchup of pool) {
    const key = drawKey(matchup.score.selectionWeight, random());
    if (key < lowestKey) {
      lowestKey = key;
      drawn = matchup;
    }
  }
  if (!drawn)
    return { state: "exhausted", matchupCount: aggregate.matchups.length };

  return random() < 0.5
    ? { state: "matchup", top: drawn.elementLow, bottom: drawn.elementHigh }
    : { state: "matchup", top: drawn.elementHigh, bottom: drawn.elementLow };
}
