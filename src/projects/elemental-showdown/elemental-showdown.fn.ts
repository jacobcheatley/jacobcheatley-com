import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  getRequestHeader,
  setCookie,
} from "@tanstack/react-start/server";
import {
  castVoteFromAddress,
  nextMatchup,
  showdownStats,
} from "./elemental-showdown.server";
import { voteCastSchema } from "./showdown-schema";
import {
  keepsTheVoter,
  mintVoter,
  readVoterCookie,
  VOTER_COOKIE,
  VOTER_COOKIE_OPTIONS,
} from "./voter-cookie";

// Thin wrappers over the helpers, which carry the tests: the handlers are the
// only place that reads the cookie, the address, the clock and the random
// source.
const voterOfRequest = () => readVoterCookie(getCookie(VOTER_COOKIE));

// Fly Proxy's own view of the client, the one header in front of this app that
// a client cannot write. `X-Forwarded-For` is whatever the client sent.
const addressOfRequest = () => getRequestHeader("fly-client-ip");

export const nextMatchupFn = createServerFn({ method: "GET" }).handler(() =>
  nextMatchup(voterOfRequest(), Math.random, Date.now()),
);

export const showdownStatsFn = createServerFn({ method: "GET" }).handler(() =>
  showdownStats(voterOfRequest(), Date.now()),
);

// `.validator(voteCastSchema)` re-validates on the server: the trust boundary.
// The cookie is minted here by the first Vote that lands and re-sent by every
// one after it, so the expiry slides.
export const castVoteFn = createServerFn({ method: "POST" })
  .validator(voteCastSchema)
  .handler(async ({ data }) => {
    const voter = voterOfRequest() ?? mintVoter();
    const cast = await castVoteFromAddress(
      voter,
      addressOfRequest(),
      Date.now(),
      data,
    );
    if (keepsTheVoter(cast))
      setCookie(VOTER_COOKIE, voter, VOTER_COOKIE_OPTIONS);
    return cast;
  });
