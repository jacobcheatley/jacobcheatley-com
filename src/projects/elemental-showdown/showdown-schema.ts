import { z } from "zod";

// Elemental Showdown's boundary values. Nothing here may import server code:
// the Tug parses a Vote in the browser with the same schema the server does.

export const ELEMENT_KINDS = ["common", "rare"] as const;

export const elementKindSchema = z.enum(ELEMENT_KINDS);

export type ElementKind = z.infer<typeof elementKindSchema>;

// One Vote read from the first Element's side: two steps is a strong win, one a
// weak win, zero too close to call.
export const VOTE_VALUES = [-2, -1, 0, 1, 2] as const;

export const voteValueSchema = z.literal(VOTE_VALUES);

export type VoteValue = z.infer<typeof voteValueSchema>;

// A Vote as the Tug casts it: the Matchup's two Elements in the order they were
// shown, and the value read from the top one's side. The server turns that into
// the orientation the Vote is stored in.
export const voteCastSchema = z
  .object({
    topElementId: z.int().positive(),
    bottomElementId: z.int().positive(),
    value: voteValueSchema,
  })
  .refine(
    ({ topElementId, bottomElementId }) => topElementId !== bottomElementId,
    {
      error: "a Matchup is two different Elements",
    },
  );

export type VoteCast = z.infer<typeof voteCastSchema>;
