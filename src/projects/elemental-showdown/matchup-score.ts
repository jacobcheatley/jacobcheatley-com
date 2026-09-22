import { VOTE_VALUES, type VoteValue } from "./showdown-schema";

// What the crowd's Votes on one Matchup add up to. Nothing here may import
// server code: the reveal, the Stats and the Stories all read these values in
// the browser.

// The crowd's call on one Matchup, read from one Element's side. What one
// Element reads as 2×, the other reads as ½×.
export type Effectiveness =
  | "4×"
  | "2×"
  | "neutral"
  | "controversial"
  | "½×"
  | "¼×";

// How sure the crowd is of that call, given how many Votes it has and how much
// they agree.
export type Confidence = "solid" | "medium" | "faint";

// What the reveal says about the Voter's own Vote once it is counted.
export type HeadlineKind =
  | "first"
  | "early"
  | "split"
  | "with"
  | "close"
  | "against";

// One Matchup's Votes as the aggregate sums them: `count`, `sum(value)` and
// `sum(value²)`.
export type MatchupSums = {
  voteCount: number;
  valueSum: number;
  squareSum: number;
};

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
};

export type MatchupScore = {
  voteCount: number;
  // Read from the lower-id Element's side, the orientation a Vote is stored in.
  effectiveness: Effectiveness;
  confidence: Confidence;
  // The shrunk mean Vote `m`, in [−2, +2].
  meanVote: number;
  // How split the crowd is, from 0 (everyone gave the same Vote) to 1.
  polarisation: number;
  // The posterior variance of the mean: few Votes or a split crowd weigh most.
  selectionWeight: number;
};

// The prior: `a` phantom Votes on each of the five values before any real Vote
// arrives. They average 0, so only their weight and their `sum(value²)`,
// `a·(4 + 1 + 0 + 1 + 4)`, enter the sums.
const PRIOR_VOTES_PER_VALUE = 0.4;
const PRIOR_WEIGHT = 5 * PRIOR_VOTES_PER_VALUE;
const PRIOR_SQUARE_SUM = 10 * PRIOR_VOTES_PER_VALUE;

// 95% of a normal distribution lies within 1.96 standard deviations.
const HALF_WIDTH_Z = 1.96;

// The Vote furthest from the middle, which bounds a Vote's variance at
// STRONGEST_VOTE² − m² and so makes polarisation a share of 1.
const STRONGEST_VOTE = 2;

// Where the mean Vote is rounded to the next Effectiveness step.
const WIN_MEAN = 0.5;
const CRUSH_MEAN = 1.5;

// Controversial is a crowd split between the two sides, not one indifferent.
const CONTROVERSIAL_POLARISATION = 0.6;

// How narrow the mean's 95% half-width has to be for each Confidence.
const SOLID_HALF_WIDTH = 0.25;
const MEDIUM_HALF_WIDTH = 0.5;

// The Votes a Matchup needs before the reveal gives a verdict, the Voter's own
// included.
const VERDICT_VOTE_COUNT = 5;

// The mean Vote rounded to the nearest Vote value: the step the crowd sits on.
const effectivenessStep = (meanVote: number): VoteValue => {
  if (meanVote >= CRUSH_MEAN) return 2;
  if (meanVote >= WIN_MEAN) return 1;
  if (meanVote <= -CRUSH_MEAN) return -2;
  if (meanVote <= -WIN_MEAN) return -1;
  return 0;
};

const effectivenessOf = (
  meanVote: number,
  polarisation: number,
): Effectiveness => {
  const step = effectivenessStep(meanVote);
  if (step === 2) return "4×";
  if (step === 1) return "2×";
  if (step === -1) return "½×";
  if (step === -2) return "¼×";
  // A crowd only counts as split where neither side is winning: a crowd that
  // splits with a lean has a winner.
  return polarisation >= CONTROVERSIAL_POLARISATION
    ? "controversial"
    : "neutral";
};

const confidenceOf = (halfWidth: number): Confidence => {
  if (halfWidth <= SOLID_HALF_WIDTH) return "solid";
  return halfWidth <= MEDIUM_HALF_WIDTH ? "medium" : "faint";
};

// The Dirichlet-multinomial posterior of one Matchup, read out as the numbers
// the reveal, the Stats, the Stories and Matchup selection all work from. A
// Matchup with no Votes needs no special case: the prior alone scores it as
// faint Neutral.
export function scoreMatchup({
  voteCount,
  valueSum,
  squareSum,
}: MatchupSums): MatchupScore {
  const weight = voteCount + PRIOR_WEIGHT;
  const meanVote = valueSum / weight;
  const voteVariance = (squareSum + PRIOR_SQUARE_SUM) / weight - meanVote ** 2;
  const meanVariance = voteVariance / (weight + 1);
  const polarisation = voteVariance / (STRONGEST_VOTE ** 2 - meanVote ** 2);
  return {
    voteCount,
    effectiveness: effectivenessOf(meanVote, polarisation),
    confidence: confidenceOf(HALF_WIDTH_Z * Math.sqrt(meanVariance)),
    meanVote,
    polarisation,
    selectionWeight: meanVariance,
  };
}

const MIRRORED_EFFECTIVENESS = {
  "4×": "¼×",
  "2×": "½×",
  neutral: "neutral",
  controversial: "controversial",
  "½×": "2×",
  "¼×": "4×",
} as const satisfies Record<Effectiveness, Effectiveness>;

// A Matchup is scored from the lower-id Element's side; the higher-id Element
// reads the same call mirrored.
export const mirrorEffectiveness = (
  effectiveness: Effectiveness,
): Effectiveness => MIRRORED_EFFECTIVENESS[effectiveness];

// What the reveal says to a Voter who has just cast `vote` on this Matchup,
// their own Vote counted in the score.
export function headlineFor(
  { voteCount, effectiveness, meanVote }: MatchupScore,
  vote: VoteValue,
): HeadlineKind {
  if (voteCount < VERDICT_VOTE_COUNT)
    return voteCount === 1 ? "first" : "early";
  if (effectiveness === "controversial") return "split";
  const stepsApart = Math.abs(vote - effectivenessStep(meanVote));
  if (stepsApart === 0) return "with";
  return stepsApart === 1 ? "close" : "against";
}

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
