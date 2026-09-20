import { z } from "zod";

// Lowercase words joined by single hyphens, the shape `/blog/<slug>` reads as
// one word to a reader and to a URL.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX = 80;

// The one schema every save is parsed with, Draft or not: the column widths as
// a type, so nothing inside the editor can be malformed.
export const articleSaveSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z.string().max(SLUG_MAX).regex(SLUG_PATTERN),
  tagline: z.string().trim().min(1).max(160),
  body: z.string(),
  // The Article's whole state: none is a Draft, and a save may set, move or
  // clear it freely.
  publishAt: z.date().nullable(),
  // A Topic exists once across the Blog whatever case it is written in, so one
  // Article cannot hold two spellings of it. How many is the owner's business.
  topics: z
    .array(z.string().trim().min(1).max(30))
    .refine(
      (names) =>
        new Set(names.map((name) => name.toLowerCase())).size === names.length,
      "An Article holds a Topic once.",
    ),
});

export type ArticleSave = z.infer<typeof articleSaveSchema>;

// A new Draft starts with no Topics: the create form has no field for them.
export const articleDraftSchema = articleSaveSchema.omit({ topics: true });

export type ArticleDraft = z.infer<typeof articleDraftSchema>;

// What the slug field holds until the owner edits it. Decomposing first turns
// an accented letter into a plain one instead of a hyphen.
export const slugify = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, "");
