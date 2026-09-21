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

export type ShowdownStats = LockedStats | { state: "unlocked" };
