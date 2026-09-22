import { describe, expect, it } from "vitest";
import { elementKindSchema, voteValueSchema } from "./showdown-schema";

describe("voteValueSchema", () => {
  it("accepts every step of the Tug", () => {
    const steps = [-2, -1, 0, 1, 2];

    expect(steps.map((step) => voteValueSchema.parse(step))).toEqual(steps);
  });

  it("rejects a step past a strong win", () => {
    expect(voteValueSchema.safeParse(-3).success).toBe(false);
    expect(voteValueSchema.safeParse(3).success).toBe(false);
  });

  it("rejects a Vote between two steps", () => {
    expect(voteValueSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("elementKindSchema", () => {
  it("accepts the two kinds of Element", () => {
    expect(elementKindSchema.parse("common")).toBe("common");
    expect(elementKindSchema.parse("rare")).toBe("rare");
  });

  it("rejects a kind nobody seeded", () => {
    expect(elementKindSchema.safeParse("legendary").success).toBe(false);
  });
});
