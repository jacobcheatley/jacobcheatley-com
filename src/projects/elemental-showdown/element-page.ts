import {
  type Confidence,
  type Effectiveness,
  isLoss,
  isWin,
  mirrorEffectiveness,
} from "./matchup-score";
import type { CrowdCalls, JudgedMatchup, ShownElement } from "./showdown-stats";

// One Element's whole standing, read out of the crowd's calls: everything its
// page says, so the page itself only draws.

// An opponent as a chip in its own colour, outlined by how sure the crowd is.
export type OpponentChip = {
  opponent: ShownElement;
  confidence: Confidence;
};

// One band of chips under its heading, named by a verb with the Effectiveness
// itself beside it.
export type EffectivenessBand = {
  effectiveness: Effectiveness;
  verb: string;
  opponents: OpponentChip[];
};

export type ElementPage = {
  winCount: number;
  lossCount: number;
  // The opponent it does worst against and the one it does best against, or
  // null while the crowd has judged none of its Matchups.
  nemesis: ShownElement | null;
  favouriteVictim: ShownElement | null;
  // Only the bands an opponent landed in, in reading order.
  bands: EffectivenessBand[];
  notYetJudgedCount: number;
};

// The crowd's call on one Matchup, turned round to the side of the Element
// whose page is being read.
type OpponentRead = OpponentChip & {
  effectiveness: Effectiveness;
  meanVote: number;
};

const BANDS = [
  { effectiveness: "4×", verb: "crushes" },
  { effectiveness: "2×", verb: "beats" },
  { effectiveness: "neutral", verb: "even with" },
  { effectiveness: "controversial", verb: "splits the crowd with" },
  { effectiveness: "½×", verb: "loses to" },
  { effectiveness: "¼×", verb: "crushed by" },
] as const satisfies readonly Omit<EffectivenessBand, "opponents">[];

const alphabetical = (one: OpponentRead, other: OpponentRead) =>
  one.opponent.name.localeCompare(other.opponent.name);

// Every tie in a band or a record line goes to the alphabetically first
// opponent, so the same crowd always reads the same page.
const worstFirst = (one: OpponentRead, other: OpponentRead) =>
  one.meanVote - other.meanVote || alphabetical(one, other);

const bestFirst = (one: OpponentRead, other: OpponentRead) =>
  other.meanVote - one.meanVote || alphabetical(one, other);

const strongestFirst = (one: OpponentRead, other: OpponentRead) =>
  Math.abs(other.meanVote) - Math.abs(one.meanVote) || alphabetical(one, other);

// A Matchup is scored from its lower-id Element's side; its higher-id Element
// reads the same call, and the same mean, the other way round.
function readFrom(
  matchup: JudgedMatchup,
  element: ShownElement,
  byId: Map<number, ShownElement>,
): OpponentRead {
  const fromTheLowSide = matchup.elementLow === element.id;
  const opponentId = fromTheLowSide ? matchup.elementHigh : matchup.elementLow;
  const opponent = byId.get(opponentId);
  if (!opponent)
    throw new Error(
      `the Stats call Matchup ${matchup.elementLow}-${matchup.elementHigh}, whose Element ${opponentId} is not among them`,
    );
  return {
    opponent,
    confidence: matchup.confidence,
    effectiveness: fromTheLowSide
      ? matchup.effectiveness
      : mirrorEffectiveness(matchup.effectiveness),
    meanVote: fromTheLowSide ? matchup.meanVote : -matchup.meanVote,
  };
}

export function elementPageOf(
  { elements, matchups }: CrowdCalls,
  element: ShownElement,
): ElementPage {
  const byId = new Map(elements.map((one) => [one.id, one]));
  const reads = matchups
    .filter(
      ({ elementLow, elementHigh }) =>
        elementLow === element.id || elementHigh === element.id,
    )
    .map((matchup) => readFrom(matchup, element, byId));
  const [nemesis] = [...reads].sort(worstFirst);
  const [favouriteVictim] = [...reads].sort(bestFirst);
  return {
    winCount: reads.filter(({ effectiveness }) => isWin(effectiveness)).length,
    lossCount: reads.filter(({ effectiveness }) => isLoss(effectiveness))
      .length,
    nemesis: nemesis?.opponent ?? null,
    favouriteVictim: favouriteVictim?.opponent ?? null,
    bands: BANDS.map(({ effectiveness, verb }) => ({
      effectiveness,
      verb,
      opponents: reads
        .filter((read) => read.effectiveness === effectiveness)
        .sort(strongestFirst)
        .map(({ opponent, confidence }) => ({ opponent, confidence })),
    })).filter(({ opponents }) => opponents.length > 0),
    // Every other Active Element is an opponent, judged or not.
    notYetJudgedCount: elements.length - 1 - reads.length,
  };
}
