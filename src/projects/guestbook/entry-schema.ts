import { z } from "zod";

// The write-path contract, shared by the server function's `.validator` (the
// trust boundary) and the form's in-browser check. No server imports here so
// the client can pull it in too.
export const entrySchema = z.object({
  name: z.string().trim().min(1).max(50),
  message: z.string().trim().min(1).max(500),
});

export type EntryInput = z.infer<typeof entrySchema>;
