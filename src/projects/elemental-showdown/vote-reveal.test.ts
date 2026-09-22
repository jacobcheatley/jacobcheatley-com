import { describe, expect, it } from "vitest";
import type { VoteValue } from "./showdown-schema";
import { noVotes, revealFor, type VoteCounts } from "./vote-reveal";

const votes = (count: number, value: VoteValue): VoteValue[] =>
  Array.from({ length: count }, () => value);

describe("revealFor", () => {
  // The Votes on one Matchup as counts, the Voter's own among them.
  const counted = (...cast: VoteValue[]): VoteCounts => {
    const counts = noVotes();
    for (const value of cast) counts[value] += 1;
    return counts;
  };

  it("gives the share of the crowd that voted as the Voter did", () => {
    expect(revealFor(counted(2, 2, 1, 0, -2), 2).sameShare).toBe(0.4);
  });

  it("scores the crowd from the counts, the Voter's own Vote among them", () => {
    expect(revealFor(counted(...votes(5, 1)), 1).headline).toBe("with");
  });

  it("keeps the crowd's mean back until the Matchup has a verdict", () => {
    expect(revealFor(counted(...votes(4, 1)), 1).crowdMean).toBeNull();
    expect(revealFor(counted(...votes(5, 1)), 1).crowdMean).toBeCloseTo(0.71);
  });
});
