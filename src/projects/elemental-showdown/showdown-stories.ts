import {
  type Effectiveness,
  headlineFor,
  isLoss,
  isWin,
  mirrorEffectiveness,
} from "./matchup-score";
import type { ShowdownElement } from "./schema";
import {
  matchupKey,
  type ScoredMatchup,
  type ShowdownAggregate,
} from "./showdown-aggregate";
import type { VoteValue } from "./showdown-schema";
import { type ShownElement, shownElementOf } from "./showdown-stats";

// The headlines the open Stats lead with, read out of the crowd's calls and the
// Voter's own Votes. Nothing here may import server code, and nothing here
// filters Active: the aggregate it is handed holds Active Matchups only.

// One of the Voter's own Votes, in the orientation it is stored in.
export type OwnVote = {
  elementLow: number;
  elementHigh: number;
  value: VoteValue;
};

// The Voter's Vote the crowd disagrees with most, read from the side the Voter
// backed: the Element they put first, then the one they put it over.
export type HottestTake = {
  elements: [ShownElement, ShownElement];
  // How far apart the Voter put them, so never negative.
  vote: 0 | 1 | 2;
};

// How the Voter stands against the crowd, over the Matchups of theirs it has
// settled. Null until it has settled one: a share of no Votes is not 0%.
export type OwnRecord = {
  withTheCrowdShare: number;
  hottestTake: HottestTake;
};

// One headline in the Stats, carrying what its card draws and nothing else.
export type Story =
  | {
      kind: "champion";
      element: ShownElement;
      winCount: number;
      opponentCount: number;
    }
  | {
      kind: "argument";
      elements: [ShownElement, ShownElement];
      voteCount: number;
    }
  | { kind: "triangle"; elements: [ShownElement, ShownElement, ShownElement] }
  | {
      kind: "biggest-crush";
      winner: ShownElement;
      loser: ShownElement;
      voteCount: number;
    }
  | {
      kind: "punching-bag";
      element: ShownElement;
      lossCount: number;
      opponentCount: number;
    }
  | { kind: "glass-cannon"; element: ShownElement }
  | { kind: "diplomat"; element: ShownElement }
  | { kind: "you"; record: OwnRecord | null };

// Only a call the crowd is sure enough of feeds a Story: a faint one is a
// guess from a few Votes, and a Story never states a guess.
const isSettled = ({ score }: ScoredMatchup) => score.confidence !== "faint";

const isCrush = (effectiveness: Effectiveness) =>
  effectiveness === "4×" || effectiveness === "¼×";

// The leader by a size, the alphabetically first of a tie, so the same crowd
// always reads the same Stories.
function leaderBy<T>(
  items: readonly T[],
  sizeOf: (item: T) => number,
  nameOf: (item: T) => string,
): T | undefined {
  let leading: { item: T; size: number } | undefined;
  for (const item of items) {
    const size = sizeOf(item);
    if (
      !leading ||
      size > leading.size ||
      (size === leading.size &&
        nameOf(item).localeCompare(nameOf(leading.item)) < 0)
    )
      leading = { item, size };
  }
  return leading?.item;
}

// The crowd's settled calls on one Element, each read from its own side.
const readsOf = (element: ShowdownElement, settled: ScoredMatchup[]) =>
  settled.flatMap(({ elementLow, elementHigh, score }) => {
    if (elementLow.id === element.id) return [score.effectiveness];
    if (elementHigh.id === element.id)
      return [mirrorEffectiveness(score.effectiveness)];
    return [];
  });

// What each Element's settled Matchups add up to: the four Stories that name
// one Element are the leaders of these four counts.
const recordsOf = (elements: ShowdownElement[], settled: ScoredMatchup[]) =>
  elements.map((element) => {
    const reads = readsOf(element, settled);
    return {
      element,
      winCount: reads.filter(isWin).length,
      lossCount: reads.filter(isLoss).length,
      crushCount: reads.filter(isCrush).length,
      neutralCount: reads.filter((read) => read === "neutral").length,
    };
  });

// A win one way round only, so a cycle read off these is a real one.
const winEdge = (from: number, to: number) => `${from}>${to}`;

function winStrengthsOf(settled: ScoredMatchup[]) {
  const strengths = new Map<string, number>();
  for (const { elementLow, elementHigh, score } of settled) {
    if (isWin(score.effectiveness))
      strengths.set(winEdge(elementLow.id, elementHigh.id), score.meanVote);
    if (isLoss(score.effectiveness))
      strengths.set(winEdge(elementHigh.id, elementLow.id), -score.meanVote);
  }
  return strengths;
}

// A rock-paper-scissors cycle of three settled wins, the one whose weakest win
// is the widest. Walking the roster by name makes the first cycle found the
// alphabetically first, and starts it on the Element whose name comes first.
function strongestTriangle(
  elements: ShowdownElement[],
  strengths: Map<string, number>,
) {
  const beats = (from: ShowdownElement, to: ShowdownElement) =>
    strengths.get(winEdge(from.id, to.id)) ?? 0;
  const byName = [...elements].sort((one, other) =>
    one.name.localeCompare(other.name),
  );
  let cycle: [ShowdownElement, ShowdownElement, ShowdownElement] | undefined;
  let weakestWin = 0;
  for (const [at, first] of byName.entries())
    for (const second of byName.slice(at + 1))
      for (const third of byName.slice(at + 1)) {
        if (third === second) continue;
        const weakest = Math.min(
          beats(first, second),
          beats(second, third),
          beats(third, first),
        );
        if (weakest > weakestWin) {
          weakestWin = weakest;
          cycle = [first, second, third];
        }
      }
  return cycle;
}

// One of the Voter's Votes on a Matchup the crowd has settled.
type OwnCall = { vote: VoteValue; matchup: ScoredMatchup };

// The Vote read from the side the Voter backed, which drops its sign.
const MARGIN = {
  "-2": 2,
  "-1": 1,
  "0": 0,
  "1": 1,
  "2": 2,
} as const satisfies Record<VoteValue, HottestTake["vote"]>;

const takeOf = ({
  vote,
  matchup: { elementLow, elementHigh },
}: OwnCall): HottestTake => ({
  elements:
    vote < 0
      ? [shownElementOf(elementHigh), shownElementOf(elementLow)]
      : [shownElementOf(elementLow), shownElementOf(elementHigh)],
  vote: MARGIN[vote],
});

// The Voter's Votes on settled Matchups only: a Vote on a Matchup the crowd is
// still guessing at is neither with it nor against it.
function ownRecordOf(
  settled: ScoredMatchup[],
  ownVotes: OwnVote[],
): OwnRecord | null {
  const byMatchup = new Map(
    settled.map((matchup) => [
      matchupKey({
        elementLow: matchup.elementLow.id,
        elementHigh: matchup.elementHigh.id,
      }),
      matchup,
    ]),
  );
  const calls = ownVotes.flatMap((vote) => {
    const matchup = byMatchup.get(matchupKey(vote));
    return matchup ? [{ vote: vote.value, matchup }] : [];
  });
  const hottest = leaderBy(
    calls,
    ({ vote, matchup }) => Math.abs(vote - matchup.score.meanVote),
    ({ matchup }) => matchup.elementLow.name,
  );
  if (!hottest) return null;
  // The same rule the reveal reads a single Vote by, over every settled Vote
  // the Voter has cast.
  const withTheCrowd = calls.filter(
    ({ vote, matchup }) => headlineFor(matchup.score, vote) === "with",
  );
  return {
    withTheCrowdShare: withTheCrowd.length / calls.length,
    hottestTake: takeOf(hottest),
  };
}

export function storiesOf(
  { elements, matchups }: ShowdownAggregate,
  ownVotes: OwnVote[],
): Story[] {
  const settled = matchups.filter(isSettled);
  // Nothing settled leaves nothing to say, not even about the Voter: the row
  // has one card of its own for that.
  if (settled.length === 0) return [];

  const opponentCount = elements.length - 1;
  const records = recordsOf(elements, settled);
  const named = ({ element }: { element: ShowdownElement }) => element.name;
  const lowName = ({ elementLow }: ScoredMatchup) => elementLow.name;

  const champion = leaderBy(
    records.filter(({ winCount }) => winCount > 0),
    ({ winCount }) => winCount,
    named,
  );
  const punchingBag = leaderBy(
    records.filter(({ lossCount }) => lossCount > 0),
    ({ lossCount }) => lossCount,
    named,
  );
  const glassCannon = leaderBy(
    records.filter(({ crushCount }) => crushCount > 0),
    ({ crushCount }) => crushCount,
    named,
  );
  const diplomat = leaderBy(
    records.filter(({ neutralCount }) => neutralCount > 0),
    ({ neutralCount }) => neutralCount,
    named,
  );
  const argument = leaderBy(
    settled.filter(({ score }) => score.effectiveness === "controversial"),
    ({ score }) => score.polarisation,
    lowName,
  );
  const crush = leaderBy(
    settled,
    ({ score }) => Math.abs(score.meanVote),
    lowName,
  );
  const triangle = strongestTriangle(elements, winStrengthsOf(settled));

  const stories: Story[] = [];
  if (champion)
    stories.push({
      kind: "champion",
      element: shownElementOf(champion.element),
      winCount: champion.winCount,
      opponentCount,
    });
  if (argument)
    stories.push({
      kind: "argument",
      elements: [
        shownElementOf(argument.elementLow),
        shownElementOf(argument.elementHigh),
      ],
      voteCount: argument.score.voteCount,
    });
  if (triangle)
    stories.push({
      kind: "triangle",
      elements: [
        shownElementOf(triangle[0]),
        shownElementOf(triangle[1]),
        shownElementOf(triangle[2]),
      ],
    });
  if (crush) {
    const lowWon = crush.score.meanVote >= 0;
    stories.push({
      kind: "biggest-crush",
      winner: shownElementOf(lowWon ? crush.elementLow : crush.elementHigh),
      loser: shownElementOf(lowWon ? crush.elementHigh : crush.elementLow),
      voteCount: crush.score.voteCount,
    });
  }
  if (punchingBag)
    stories.push({
      kind: "punching-bag",
      element: shownElementOf(punchingBag.element),
      lossCount: punchingBag.lossCount,
      opponentCount,
    });
  if (glassCannon)
    stories.push({
      kind: "glass-cannon",
      element: shownElementOf(glassCannon.element),
    });
  if (diplomat)
    stories.push({
      kind: "diplomat",
      element: shownElementOf(diplomat.element),
    });
  stories.push({ kind: "you", record: ownRecordOf(settled, ownVotes) });
  return stories;
}
