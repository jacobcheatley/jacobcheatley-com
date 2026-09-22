import {
  type HeadlineKind,
  headlineFor,
  type MatchupSums,
  scoreMatchup,
} from "./matchup-score";
import {
  type RateWindow,
  VOTE_VALUES,
  type VoteValue,
} from "./showdown-schema";
import type { ShownElement } from "./showdown-stats";

// What casting a Vote gives the Voter back. Nothing here may import server
// code: the Tug reads the reveal in the browser.

// How many Votes each of the five values has, read from one Element's side.
export type VoteCounts = Record<VoteValue, number>;

// A Matchup nobody has voted on: what counting starts from, since a tally only
// names the values somebody chose.
export const noVotes = (): VoteCounts => ({
  "-2": 0,
  "-1": 0,
  "0": 0,
  "1": 0,
  "2": 0,
});

// What a Voter is shown the moment their Vote lands, read from the side the
// Matchup was shown to them.
export type VoteReveal = {
  state: "reveal";
  // The Voter's own Vote is one of these.
  counts: VoteCounts;
  // The Vote that stands: a Voter who votes twice keeps their first.
  vote: VoteValue;
  sameShare: number;
  headline: HeadlineKind;
  // Where the crowd's mean sits on the Vote scale, or null below the verdict
  // gate, where a handful of Votes is no crowd to stand against.
  crowdMean: number | null;
  // The Active Elements the unlock's wave flips a tile for, here on the one
  // Vote that opened the Stats to this Voter and on no other. Only the cast
  // path can tell: it counts the Votes either side of this one.
  unlockedElements?: ShownElement[];
};

// A Vote that was never stored: this address has cast more than the window
// named allows. The Matchup stays up, so the next drag simply casts again.
export type VoteLimited = {
  state: "limited";
  window: RateWindow;
};

export type VoteCastResult = VoteReveal | VoteLimited;

const sumsOf = (counts: VoteCounts): MatchupSums =>
  VOTE_VALUES.reduce<MatchupSums>(
    (sums, value) => ({
      voteCount: sums.voteCount + counts[value],
      valueSum: sums.valueSum + value * counts[value],
      squareSum: sums.squareSum + value * value * counts[value],
    }),
    { voteCount: 0, valueSum: 0, squareSum: 0 },
  );

// The reveal of one Matchup to the Voter who has just cast `vote` on it, from
// the counts their own Vote is already in.
export function revealFor(counts: VoteCounts, vote: VoteValue): VoteReveal {
  const sums = sumsOf(counts);
  const score = scoreMatchup(sums);
  const headline = headlineFor(score, vote);
  const hasVerdict = headline !== "first" && headline !== "early";
  return {
    state: "reveal",
    counts,
    vote,
    sameShare: counts[vote] / sums.voteCount,
    headline,
    crowdMean: hasVerdict ? score.meanVote : null,
  };
}
