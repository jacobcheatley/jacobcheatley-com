import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { castVote, nextMatchup } from "./elemental-showdown.server";
import { voteCastSchema } from "./showdown-schema";
import {
  readVoterCookie,
  VOTER_COOKIE,
  VOTER_COOKIE_OPTIONS,
} from "./voter-cookie";

// Thin wrappers over the helpers, which carry the tests: the handlers are the
// only place that reads the cookie and the random source.
const voterOfRequest = () => readVoterCookie(getCookie(VOTER_COOKIE));

export const nextMatchupFn = createServerFn({ method: "GET" }).handler(() =>
  nextMatchup(voterOfRequest(), Math.random, Date.now()),
);

// `.validator(voteCastSchema)` re-validates on the server: the trust boundary.
// The cookie is minted here by the first Vote and re-sent by every one after
// it, so the expiry slides and nothing is set before a deliberate Vote.
export const castVoteFn = createServerFn({ method: "POST" })
  .validator(voteCastSchema)
  .handler(async ({ data }) => {
    const voter = voterOfRequest() ?? crypto.randomUUID();
    setCookie(VOTER_COOKIE, voter, VOTER_COOKIE_OPTIONS);
    return castVote(voter, data);
  });
