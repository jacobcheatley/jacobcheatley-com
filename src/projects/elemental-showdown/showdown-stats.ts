import type { Confidence, Effectiveness } from "./matchup-score";
import type { ShowdownElement } from "./schema";
import type { ShowdownAggregate } from "./showdown-aggregate";
import type { Story } from "./showdown-stories";

// What the Stats hand a visitor, and the two numbers that open them. Nothing
// here may import server code: the locked screen draws its meters from these
// constants in the browser.

// How many Votes the Voter casts before the Stats are theirs, and how many the
// crowd has to have cast between them.
export const OWN_VOTES_TO_UNLOCK = 20;
export const EVERY_VOTES_TO_UNLOCK = 250;

// The Voter's own Votes and every Vote ever cast, on an Active Matchup or not.
export type UnlockCounts = {
  ownVoteCount: number;
  everyVoteCount: number;
};

// Inclusive at both numbers. Nothing is stored about having passed it: Votes
// are never deleted and both counts include every Vote, so the Stats unlock
// once and never re-lock.
export const isStatsUnlocked = ({
  ownVoteCount,
  everyVoteCount,
}: UnlockCounts) =>
  ownVoteCount >= OWN_VOTES_TO_UNLOCK &&
  everyVoteCount >= EVERY_VOTES_TO_UNLOCK;

// Locked, a visitor is told only how far off the two numbers are and how many
// tiles the mosaic has: no Element, no colour and no Effectiveness leaves the
// server until the Stats are open.
export type LockedStats = UnlockCounts & {
  state: "locked";
  elementCount: number;
};

// An Element as a screen draws it: the Matchup, the unlock's mosaic and the
// Stats. Its kind is not here — Common and Rare are never user facing.
export type ShownElement = {
  id: number;
  name: string;
  emoji: string;
  colour: string;
};

export const shownElementOf = ({
  id,
  name,
  emoji,
  colour,
}: ShowdownElement): ShownElement => ({ id, name, emoji, colour });

// The crowd's call on one Matchup it has judged, read from the lower-id
// Element's side, the way the Vote is stored.
export type JudgedMatchup = {
  elementLow: number;
  elementHigh: number;
  effectiveness: Effectiveness;
  confidence: Confidence;
  // Where the crowd's mean Vote sits: what ranks one opponent against another.
  meanVote: number;
};

// The Active Elements and every call the crowd has made, which the Element
// pages and the Stories are both read out of.
export type CrowdCalls = {
  elements: ShownElement[];
  matchups: JudgedMatchup[];
};

// The Stories lead, then the Element pages. Both are read out of the same
// Active Matchups, but a Story also knows the Voter's own Votes, so the two are
// computed apart and sent together.
export type UnlockedStats = CrowdCalls & {
  state: "unlocked";
  stories: Story[];
};

export type ShowdownStats = LockedStats | UnlockedStats;

// A Matchup nobody has voted on is left out rather than sent as the Neutral
// its prior alone scores it: on an Element's page it is not yet judged, and
// silence is not a verdict.
export const crowdCallsOf = ({
  elements,
  matchups,
}: ShowdownAggregate): CrowdCalls => ({
  elements: elements.map(shownElementOf),
  matchups: matchups
    .filter(({ score }) => score.voteCount > 0)
    .map(({ elementLow, elementHigh, score }) => ({
      elementLow: elementLow.id,
      elementHigh: elementHigh.id,
      effectiveness: score.effectiveness,
      confidence: score.confidence,
      meanVote: score.meanVote,
    })),
});
