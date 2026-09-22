import { isIPv6 } from "node:net";
import type { RateWindow } from "./showdown-schema";

// A fast thumb casts perhaps 30 Votes a minute, and a whole household, office
// or carrier can sit behind one address, so the cap is generous.
export const VOTES_PER_MINUTE = 60;
export const VOTES_PER_DAY = 2_000;

export const MINUTE_WINDOW_MS = 60_000;
const DAY_WINDOW_MS = 24 * 60 * MINUTE_WINDOW_MS;

// Every request that arrives without a Fly-Client-IP header shares this one:
// local development and the tests are one address as far as the cap is
// concerned, never unlimited.
const NO_ADDRESS = "no address";

// A home IPv6 visitor owns their whole /64, so rotating the rest of the
// address is free and only the four leading hextets are worth counting.
const IPV6_BUCKET_HEXTETS = 4;
const IPV6_HEXTETS = 8;

// The /64 of an IPv6 address, expanded through its one `::` and with each
// hextet's leading zeros dropped, so that the several ways of writing one
// address are one bucket.
function ipv6Bucket(address: string): string {
  const [head = "", tail = ""] = address.split("::");
  const headHextets = head ? head.split(":") : [];
  const tailHextets = tail ? tail.split(":") : [];
  const hidden = IPV6_HEXTETS - headHextets.length - tailHextets.length;
  return [...headHextets, ...Array<string>(hidden).fill("0"), ...tailHextets]
    .slice(0, IPV6_BUCKET_HEXTETS)
    .map((hextet) => Number.parseInt(hextet, 16).toString(16))
    .join(":");
}

// An address the header did not give in a form the counter can key on is
// counted whole: a bucket of its own is still a bucket.
const bucketFor = (address: string | undefined): string => {
  if (!address) return NO_ADDRESS;
  return isIPv6(address) ? ipv6Bucket(address) : address;
};

// One fixed window, counting every attempt against one cap. The counts are
// emptied the moment the window rolls, so the map never holds more than one
// window's addresses.
function fixedWindow(name: RateWindow, limit: number, lengthMs: number) {
  const attempts = new Map<string, number>();
  let startedAtMs = Number.NEGATIVE_INFINITY;
  // Counts this attempt, and names the window when it is one too many.
  return (bucket: string, nowMs: number): RateWindow | undefined => {
    if (nowMs - startedAtMs >= lengthMs) {
      attempts.clear();
      startedAtMs = nowMs;
    }
    const attemptCount = (attempts.get(bucket) ?? 0) + 1;
    attempts.set(bucket, attemptCount);
    return attemptCount > limit ? name : undefined;
  };
}

// The cap on one address, read through the clock the caller hands in: the
// window a Vote has run past, or nothing when it is within both.
export function createVoteLimiter() {
  const windows = [
    fixedWindow("minute", VOTES_PER_MINUTE, MINUTE_WINDOW_MS),
    fixedWindow("day", VOTES_PER_DAY, DAY_WINDOW_MS),
  ];
  return (
    address: string | undefined,
    nowMs: number,
  ): RateWindow | undefined => {
    const bucket = bucketFor(address);
    let limitedBy: RateWindow | undefined;
    // Every attempt counts in both windows, stored or not, so neither window
    // is skipped once the other has turned this Vote down.
    for (const countAttempt of windows) {
      const ranPast = countAttempt(bucket, nowMs);
      limitedBy ??= ranPast;
    }
    return limitedBy;
  };
}
