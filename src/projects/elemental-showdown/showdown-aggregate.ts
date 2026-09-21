import {
  type MatchupScore,
  type MatchupSums,
  scoreMatchup,
} from "./matchup-score";
import type { ShowdownElement } from "./schema";

// The crowd's Votes as a whole, held for a minute at a time. Nothing here may
// import server code: the Stats read these values in the browser.

// One voted Matchup as the SQL aggregate groups it, by the two Element ids the
// Vote is stored against.
export type MatchupSumsRow = MatchupSums & {
  elementLow: number;
  elementHigh: number;
};

// An Active Matchup and the crowd's call on it. A Matchup nobody has voted on
// is here too, scored from the prior alone.
export type ScoredMatchup = {
  elementLow: ShowdownElement;
  elementHigh: ShowdownElement;
  score: MatchupScore;
};

// What selection, the Stats and the Stories all read. The Active filter is
// applied where this is built and nowhere else, so nothing downstream can see a
// switched-off Element.
export type ShowdownAggregate = {
  elements: ShowdownElement[];
  matchups: ScoredMatchup[];
  // Every Vote ever cast, on an Active Matchup or not: what the Stats gate
  // counts, so switching an Element off never walks the meter backwards.
  everyVoteCount: number;
};

export const matchupKey = (elementLow: number, elementHigh: number) =>
  `${elementLow}:${elementHigh}`;

const NO_VOTES: MatchupSums = { voteCount: 0, valueSum: 0, squareSum: 0 };

// There is no Matchup table: the Matchups are the Element self-join on
// `a.id < b.id`, and a Matchup is Active when both its Elements are.
export function aggregateOf({
  elements,
  matchupSums,
}: {
  elements: ShowdownElement[];
  matchupSums: MatchupSumsRow[];
}): ShowdownAggregate {
  const sumsByMatchup = new Map(
    matchupSums.map((row) => [
      matchupKey(row.elementLow, row.elementHigh),
      row,
    ]),
  );
  const active = elements
    .filter((element) => element.isActive)
    .sort((one, other) => one.id - other.id);

  const matchups: ScoredMatchup[] = [];
  for (const [at, elementLow] of active.entries())
    for (const elementHigh of active.slice(at + 1))
      matchups.push({
        elementLow,
        elementHigh,
        score: scoreMatchup(
          sumsByMatchup.get(matchupKey(elementLow.id, elementHigh.id)) ??
            NO_VOTES,
        ),
      });

  return {
    elements: active,
    matchups,
    everyVoteCount: matchupSums.reduce(
      (total, row) => total + row.voteCount,
      0,
    ),
  };
}

// How long a Machine holds its copy: long enough that a burst of Votes is one
// aggregate query, short enough that switching an Element off takes effect
// while the owner is still looking.
export const AGGREGATE_LIFETIME_MS = 60_000;

// The one in-memory copy, read through the clock the caller hands in. Two
// requests racing a cold cache load it twice, which costs one query and never
// serves a stale read.
export function cacheAggregate(load: () => Promise<ShowdownAggregate>) {
  let held: { loadedAtMs: number; aggregate: ShowdownAggregate } | undefined;
  return async (nowMs: number): Promise<ShowdownAggregate> => {
    if (!held || nowMs - held.loadedAtMs >= AGGREGATE_LIFETIME_MS)
      held = { loadedAtMs: nowMs, aggregate: await load() };
    return held.aggregate;
  };
}
