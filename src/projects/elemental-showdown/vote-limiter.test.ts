import { describe, expect, it } from "vitest";
import type { RateWindow } from "./showdown-schema";
import {
  createVoteLimiter,
  MINUTE_WINDOW_MS,
  VOTES_PER_DAY,
  VOTES_PER_MINUTE,
} from "./vote-limiter";

const ADDRESS = "203.0.113.7";

type LimitVote = ReturnType<typeof createVoteLimiter>;

// The whole minute's cap, spent by one address.
function spendMinute(
  limitVote: LimitVote,
  address: string | undefined,
  nowMs: number,
) {
  for (let cast = 0; cast < VOTES_PER_MINUTE; cast++) limitVote(address, nowMs);
}

describe("the minute's cap", () => {
  it("lets the minute's last Vote through and turns the next one down", () => {
    const limitVote = createVoteLimiter();
    for (let cast = 1; cast < VOTES_PER_MINUTE; cast++) limitVote(ADDRESS, 0);

    expect(limitVote(ADDRESS, 0)).toBeUndefined();
    expect(limitVote(ADDRESS, 0)).toBe("minute");
  });

  it("gives the address the whole cap again in the next minute", () => {
    const limitVote = createVoteLimiter();
    spendMinute(limitVote, ADDRESS, 0);
    expect(limitVote(ADDRESS, 0)).toBe("minute");

    expect(limitVote(ADDRESS, MINUTE_WINDOW_MS)).toBeUndefined();
  });
});

describe("the day's cap", () => {
  it("turns a Vote down for the day once the address has spent the day", () => {
    const limitVote = createVoteLimiter();
    let nowMs = 0;
    let lastOfTheDay: RateWindow | undefined;
    // A fresh minute every time the minute's cap is spent, so the day's is the
    // only one left to hit.
    for (let cast = 0; cast < VOTES_PER_DAY; cast++) {
      if (cast % VOTES_PER_MINUTE === 0) nowMs += MINUTE_WINDOW_MS;
      lastOfTheDay = limitVote(ADDRESS, nowMs);
    }
    expect(lastOfTheDay).toBeUndefined();

    expect(limitVote(ADDRESS, nowMs)).toBe("day");
  });
});

describe("what counts as one address", () => {
  it("keeps one IPv4 address's cap off another's", () => {
    const limitVote = createVoteLimiter();
    spendMinute(limitVote, ADDRESS, 0);

    expect(limitVote("203.0.113.8", 0)).toBeUndefined();
  });

  it("counts two addresses in one IPv6 /64 as one address", () => {
    const limitVote = createVoteLimiter();
    spendMinute(limitVote, "2001:db8:1:2::1", 0);

    expect(limitVote("2001:db8:1:2:ffff::9", 0)).toBe("minute");
  });

  it("leaves an IPv6 address in another /64 its own cap", () => {
    const limitVote = createVoteLimiter();
    spendMinute(limitVote, "2001:db8:1:2::1", 0);

    expect(limitVote("2001:db8:1:3::1", 0)).toBeUndefined();
  });

  it("reads the two ways of writing one /64 as the same address", () => {
    const limitVote = createVoteLimiter();
    spendMinute(limitVote, "2001:db8:1:2::1", 0);

    expect(limitVote("2001:0db8:0001:0002:0:0:0:1", 0)).toBe("minute");
  });

  it("keeps one IPv4-mapped address's cap off another's", () => {
    const limitVote = createVoteLimiter();
    spendMinute(limitVote, "::ffff:203.0.113.7", 0);

    expect(limitVote("::ffff:203.0.113.8", 0)).toBeUndefined();
  });

  it("counts an IPv4-mapped address as the IPv4 address it carries", () => {
    const limitVote = createVoteLimiter();
    spendMinute(limitVote, `::ffff:${ADDRESS}`, 0);

    expect(limitVote(ADDRESS, 0)).toBe("minute");
  });

  it("puts every request that arrives without an address in one bucket", () => {
    const limitVote = createVoteLimiter();
    spendMinute(limitVote, undefined, 0);

    expect(limitVote(undefined, 0)).toBe("minute");
  });
});
