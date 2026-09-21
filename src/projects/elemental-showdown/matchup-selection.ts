import type { ShowdownElement } from "./schema";

// A Matchup as it is shown: which Element is on top is the draw's coin flip.
export type Matchup = { top: ShowdownElement; bottom: ShowdownElement };

export type NextMatchup =
  | ({ state: "matchup" } & Matchup)
  | { state: "exhausted"; matchupCount: number };

// One Vote of this Voter's, read only for the Matchup it settles.
export type VotedMatchup = { elementLow: number; elementHigh: number };

const matchupKey = ({ elementLow, elementHigh }: VotedMatchup) =>
  `${elementLow}:${elementHigh}`;

// There is no Matchup table: the Matchups are the Element self-join on
// `a.id < b.id`, and a Matchup is Active when both its Elements are. The draw
// is uniform over the Active Matchups this Voter has not voted on.
export function drawMatchup({
  elements,
  votes,
  random,
}: {
  elements: ShowdownElement[];
  votes: VotedMatchup[];
  random: () => number;
}): NextMatchup {
  const active = elements
    .filter((element) => element.isActive)
    .sort((one, other) => one.id - other.id);
  const voted = new Set(votes.map(matchupKey));

  let matchupCount = 0;
  const unvoted: Matchup[] = [];
  for (const [at, low] of active.entries())
    for (const high of active.slice(at + 1)) {
      matchupCount++;
      if (!voted.has(matchupKey({ elementLow: low.id, elementHigh: high.id })))
        unvoted.push({ top: low, bottom: high });
    }

  const drawn = unvoted[Math.floor(random() * unvoted.length)];
  if (!drawn) return { state: "exhausted", matchupCount };
  return random() < 0.5
    ? { state: "matchup", ...drawn }
    : { state: "matchup", top: drawn.bottom, bottom: drawn.top };
}
