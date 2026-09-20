import { describe, expect, it } from "vitest";
import { articleSaveSchema, slugify } from "./article-schema";

const save = (fields: Partial<Record<string, unknown>> = {}) => ({
  title: "An Article",
  slug: "an-article",
  tagline: "One line about it.",
  body: "",
  publishAt: null,
  topics: [],
  ...fields,
});
const accepts = (fields: Partial<Record<string, unknown>>) =>
  articleSaveSchema.safeParse(save(fields)).success;
const repeat = (length: number) => "a".repeat(length);

describe("articleSaveSchema", () => {
  it("takes a title of 1 character and of 120, and no more", () => {
    expect(accepts({ title: repeat(1) })).toBe(true);
    expect(accepts({ title: repeat(120) })).toBe(true);
    expect(accepts({ title: "" })).toBe(false);
    expect(accepts({ title: repeat(121) })).toBe(false);
  });

  it("takes a Tagline of 1 character and of 160, and no more", () => {
    expect(accepts({ tagline: repeat(1) })).toBe(true);
    expect(accepts({ tagline: repeat(160) })).toBe(true);
    expect(accepts({ tagline: "" })).toBe(false);
    expect(accepts({ tagline: repeat(161) })).toBe(false);
  });

  it("rejects a title or Tagline that is only whitespace", () => {
    expect(accepts({ title: "   " })).toBe(false);
    expect(accepts({ tagline: "   " })).toBe(false);
  });

  it("takes a slug of lowercase words joined by single hyphens", () => {
    expect(accepts({ slug: "a" })).toBe(true);
    expect(accepts({ slug: "type-safe-sql-2" })).toBe(true);
    expect(accepts({ slug: "" })).toBe(false);
    expect(accepts({ slug: "Type-Safe" })).toBe(false);
    expect(accepts({ slug: "two--hyphens" })).toBe(false);
    expect(accepts({ slug: "-leading" })).toBe(false);
    expect(accepts({ slug: "trailing-" })).toBe(false);
    expect(accepts({ slug: "with space" })).toBe(false);
  });

  it("takes a slug of 80 characters, and no more", () => {
    expect(accepts({ slug: repeat(80) })).toBe(true);
    expect(accepts({ slug: repeat(81) })).toBe(false);
  });

  it("takes an empty body, because a new Draft has one", () => {
    expect(accepts({ body: "" })).toBe(true);
  });

  it("takes a Topic of 1 character and of 30, and no more", () => {
    expect(accepts({ topics: [repeat(1)] })).toBe(true);
    expect(accepts({ topics: [repeat(30)] })).toBe(true);
    expect(accepts({ topics: [""] })).toBe(false);
    expect(accepts({ topics: ["   "] })).toBe(false);
    expect(accepts({ topics: [repeat(31)] })).toBe(false);
  });

  it("rejects a Topic the Article already holds in another case", () => {
    expect(accepts({ topics: ["TypeScript", "Postgres"] })).toBe(true);
    expect(accepts({ topics: ["TypeScript", "typescript"] })).toBe(false);
  });

  it("takes a Publish date or none, and nothing standing in for a date", () => {
    expect(accepts({ publishAt: new Date("2026-09-14T03:00:00Z") })).toBe(true);
    expect(accepts({ publishAt: null })).toBe(true);
    expect(accepts({ publishAt: "2026-09-14T03:00:00Z" })).toBe(false);
    expect(accepts({ publishAt: undefined })).toBe(false);
  });
});

describe("slugify", () => {
  it("joins a title's words with single hyphens, lowercased", () => {
    expect(slugify("Type-safe SQL, at last!")).toBe("type-safe-sql-at-last");
  });

  it("strips the accents a slug cannot hold", () => {
    expect(slugify("Café résumé")).toBe("cafe-resume");
  });

  it("leaves no hyphen hanging off either end, even at 80 characters", () => {
    expect(slugify("  Hello  ")).toBe("hello");
    expect(slugify(`${repeat(79)} more`)).toBe(repeat(79));
  });

  it("gives a title with nothing a slug can use an empty slug", () => {
    expect(slugify("!!!")).toBe("");
  });
});
