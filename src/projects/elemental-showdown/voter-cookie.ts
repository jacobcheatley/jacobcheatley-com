import { z } from "zod";
import type { VoteCastResult } from "./vote-reveal";

// A Voter is a browser: an unsigned uuid in a cookie, minted by the first Vote
// and re-sent by every one after it. Nothing else is kept, so there is nothing
// to sign and nothing to notice.
export const VOTER_COOKIE = "elemental_showdown_voter";

// 400 days is as far out as a browser will hold an expiry.
const DAYS_KEPT = 400;

export const VOTER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: import.meta.env.PROD,
  maxAge: DAYS_KEPT * 24 * 60 * 60,
} as const;

export const voterSchema = z.uuid().brand<"Voter">();

// One browser, as everything that reads a Vote names it: never a bare string
// that another uuid could be handed in place of.
export type Voter = z.infer<typeof voterSchema>;

// Anything the browser sends that is not a uuid is no cookie at all: that
// browser has voted on nothing and gets a fresh Voter on its next Vote.
export const readVoterCookie = (cookie: string | undefined) =>
  voterSchema.safeParse(cookie).data;

// A Vote the cap turned down stored nothing, so it neither mints a Voter nor
// slides one's expiry: the cookie is set by a Vote that landed and no other.
export const keepsTheVoter = (cast: VoteCastResult) => cast.state === "reveal";

// A browser's first Vote mints one, parsed the same way as one read back.
export const mintVoter = (): Voter => voterSchema.parse(crypto.randomUUID());
