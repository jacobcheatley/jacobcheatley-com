import { z } from "zod";

// Elemental Showdown's boundary values. Nothing here may import server code:
// the Tug parses a Vote in the browser with the same schema the server does.

export const ELEMENT_KINDS = ["common", "rare"] as const;

export const elementKindSchema = z.enum(ELEMENT_KINDS);

export type ElementKind = z.infer<typeof elementKindSchema>;

// One Vote read from the first Element's side: two steps is a strong win, one a
// weak win, zero too close to call.
export const voteValueSchema = z.literal([-2, -1, 0, 1, 2]);

export type VoteValue = z.infer<typeof voteValueSchema>;
