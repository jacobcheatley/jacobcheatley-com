import { describe, expect, it } from "vitest";
import { noVotes, type VoteCastResult } from "./vote-reveal";
import {
  keepsTheVoter,
  mintVoter,
  readVoterCookie,
  VOTER_COOKIE_OPTIONS,
} from "./voter-cookie";

describe("readVoterCookie", () => {
  it("takes the Voter the last Vote minted", () => {
    const voter = "11111111-1111-4111-8111-111111111111";

    expect(readVoterCookie(voter)).toBe(voter);
  });

  it("treats a browser with no cookie as a visitor who has seen nothing", () => {
    expect(readVoterCookie(undefined)).toBeUndefined();
  });

  it("treats anything that is not a uuid as no cookie at all", () => {
    expect(readVoterCookie("")).toBeUndefined();
    expect(readVoterCookie("not-a-uuid")).toBeUndefined();
    expect(readVoterCookie("11111111-1111-4111-8111-11111111111")).toBe(
      undefined,
    );
  });
});

describe("mintVoter", () => {
  it("mints a Voter the cookie reads back as the same one", () => {
    const minted = mintVoter();

    expect(readVoterCookie(minted)).toBe(minted);
  });
});

describe("keepsTheVoter", () => {
  it("keeps the Voter of a Vote the crowd's split came back for", () => {
    const reveal: VoteCastResult = {
      state: "reveal",
      counts: noVotes(),
      vote: 0,
      sameShare: 1,
      headline: "first",
      crowdMean: null,
    };

    expect(keepsTheVoter(reveal)).toBe(true);
  });

  it("keeps no Voter for an attempt the cap turned down", () => {
    expect(keepsTheVoter({ state: "limited", window: "minute" })).toBe(false);
  });
});

describe("VOTER_COOKIE_OPTIONS", () => {
  it("is functional only: no script reads it, and it travels with the Voter's own navigation", () => {
    expect(VOTER_COOKIE_OPTIONS).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("slides its expiry out as far as a browser will keep it", () => {
    expect(VOTER_COOKIE_OPTIONS.maxAge).toBe(400 * 24 * 60 * 60);
  });
});
