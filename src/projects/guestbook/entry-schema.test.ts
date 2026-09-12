import { describe, expect, it } from "vitest";
import { entrySchema } from "./entry-schema";

describe("entrySchema", () => {
  it("accepts a valid entry and trims whitespace", () => {
    const result = entrySchema.safeParse({
      name: "  Ada  ",
      message: "  Hello  ",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Ada", message: "Hello" });
  });

  it("rejects a name that is empty after trimming", () => {
    expect(entrySchema.safeParse({ name: "   ", message: "hi" }).success).toBe(
      false,
    );
  });

  it("rejects an empty message", () => {
    expect(entrySchema.safeParse({ name: "Ada", message: "" }).success).toBe(
      false,
    );
  });

  it("rejects a name over 50 characters", () => {
    expect(
      entrySchema.safeParse({ name: "a".repeat(51), message: "hi" }).success,
    ).toBe(false);
  });

  it("rejects a message over 500 characters", () => {
    expect(
      entrySchema.safeParse({ name: "Ada", message: "a".repeat(501) }).success,
    ).toBe(false);
  });
});
