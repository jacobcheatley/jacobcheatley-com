import { describe, expect, it } from "vitest";
import {
  headlineFor,
  mirrorEffectiveness,
  noVotes,
  revealFor,
  scoreMatchup,
  type VoteCounts,
} from "./matchup-score";
import type { VoteValue } from "./showdown-schema";

// The three sums the aggregate returns, built from the Votes that made them so
// a crowd can never be described by sums that disagree.
const crowd = (...votes: VoteValue[]) => ({
  voteCount: votes.length,
  valueSum: votes.reduce<number>((total, value) => total + value, 0),
  squareSum: votes.reduce<number>((total, value) => total + value * value, 0),
});

const votes = (count: number, value: VoteValue): VoteValue[] =>
  Array.from({ length: count }, () => value);

describe("scoreMatchup", () => {
  it("crosses from Neutral to 2× at the win cut", () => {
    // five weak wins against three too-close-to-call: the mean sits on 0.5
    const onTheCut = scoreMatchup(crowd(...votes(5, 1), ...votes(3, 0)));
    const belowIt = scoreMatchup(crowd(...votes(5, 1), ...votes(4, 0)));

    expect(onTheCut.meanVote).toBe(0.5);
    expect(onTheCut.effectiveness).toBe("2×");
    expect(belowIt.effectiveness).toBe("neutral");
  });

  it("crosses from 2× to 4× at the crush cut", () => {
    const onTheCut = scoreMatchup(crowd(...votes(7, 2), 1));
    const belowIt = scoreMatchup(crowd(...votes(6, 2), ...votes(2, 1)));

    expect(onTheCut.meanVote).toBe(1.5);
    expect(onTheCut.effectiveness).toBe("4×");
    expect(belowIt.effectiveness).toBe("2×");
  });

  it("reads the lower-id Element losing as ½× and ¼×", () => {
    expect(
      scoreMatchup(crowd(...votes(5, -1), ...votes(3, 0))).effectiveness,
    ).toBe("½×");
    expect(scoreMatchup(crowd(...votes(7, -2), -1)).effectiveness).toBe("¼×");
  });

  it("crosses from Neutral to Controversial at the polarisation cut", () => {
    // one Voter each way at the extremes, with one shrugging Voter between them
    const onTheCut = scoreMatchup(crowd(-2, 0, 2));
    const belowIt = scoreMatchup(crowd(-2, 0, 0, 2));

    expect(onTheCut.polarisation).toBe(0.6);
    expect(onTheCut.effectiveness).toBe("controversial");
    expect(belowIt.effectiveness).toBe("neutral");
  });

  it("calls a crowd split between the extremes Controversial", () => {
    expect(scoreMatchup(crowd(-2, -2, 2, 2)).effectiveness).toBe(
      "controversial",
    );
  });

  it("calls a crowd piled on too close to call Neutral", () => {
    expect(scoreMatchup(crowd(...votes(14, 0))).effectiveness).toBe("neutral");
  });

  it("calls a split crowd with a lean a win rather than Controversial", () => {
    const leaning = scoreMatchup(crowd(...votes(4, 2), ...votes(2, -2)));

    expect(leaning.polarisation).toBeGreaterThan(0.6);
    expect(leaning.effectiveness).toBe("2×");
  });

  it("crosses from faint to medium at the medium Confidence cut", () => {
    expect(scoreMatchup(crowd(...votes(5, 0))).confidence).toBe("faint");
    expect(scoreMatchup(crowd(...votes(6, 0))).confidence).toBe("medium");
  });

  it("crosses from medium to solid at the solid Confidence cut", () => {
    expect(scoreMatchup(crowd(...votes(13, 0))).confidence).toBe("medium");
    expect(scoreMatchup(crowd(...votes(14, 0))).confidence).toBe("solid");
  });

  it("scores a Matchup nobody has voted on as faint Neutral", () => {
    expect(scoreMatchup(crowd())).toMatchObject({
      effectiveness: "neutral",
      confidence: "faint",
      voteCount: 0,
    });
  });

  it("weighs a Matchup nobody has voted on above a settled one", () => {
    expect(scoreMatchup(crowd()).selectionWeight).toBeGreaterThan(
      scoreMatchup(crowd(...votes(14, 0))).selectionWeight,
    );
  });
});

describe("mirrorEffectiveness", () => {
  it("reads a win from the other Element's side as a loss", () => {
    expect(mirrorEffectiveness("2×")).toBe("½×");
    expect(mirrorEffectiveness("4×")).toBe("¼×");
    expect(mirrorEffectiveness("½×")).toBe("2×");
    expect(mirrorEffectiveness("¼×")).toBe("4×");
  });

  it("reads a Matchup with no winner the same from both sides", () => {
    expect(mirrorEffectiveness("neutral")).toBe("neutral");
    expect(mirrorEffectiveness("controversial")).toBe("controversial");
  });
});

describe("headlineFor", () => {
  // The crowd's mean sits at +0.71, so its Effectiveness step is a weak win.
  const weakWinCrowd = scoreMatchup(crowd(...votes(5, 1)));

  it("calls the only Vote on a Matchup the first to call it", () => {
    expect(headlineFor(scoreMatchup(crowd(2)), 2)).toBe("first");
  });

  it("calls the Votes below the verdict gate early days", () => {
    expect(headlineFor(scoreMatchup(crowd(...votes(4, 1))), 1)).toBe("early");
  });

  it("sides the Voter with the crowd when their Vote is its step", () => {
    expect(headlineFor(weakWinCrowd, 1)).toBe("with");
  });

  it("puts the Voter close to the crowd one step either side of it", () => {
    expect(headlineFor(weakWinCrowd, 0)).toBe("close");
    expect(headlineFor(weakWinCrowd, 2)).toBe("close");
  });

  it("puts the Voter against the crowd two steps or more from it", () => {
    expect(headlineFor(weakWinCrowd, -1)).toBe("against");
    expect(headlineFor(weakWinCrowd, -2)).toBe("against");
  });

  it("says the crowd is split on a Controversial Matchup", () => {
    const split = scoreMatchup(crowd(...votes(3, -2), ...votes(3, 2)));

    expect(headlineFor(split, 2)).toBe("split");
    expect(headlineFor(split, -2)).toBe("split");
  });
});

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
