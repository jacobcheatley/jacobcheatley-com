import { describe, expect, it } from "vitest";
import {
  elementKindSchema,
  voteCastSchema,
  voteValueSchema,
} from "./showdown-schema";

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

describe("voteCastSchema", () => {
  const matchup = { topElementId: 7, bottomElementId: 3 };

  it("takes a strong win for either Element", () => {
    expect(voteCastSchema.parse({ ...matchup, value: 2 })).toEqual({
      ...matchup,
      value: 2,
    });
    expect(voteCastSchema.parse({ ...matchup, value: -2 })).toEqual({
      ...matchup,
      value: -2,
    });
  });

  it("refuses a win stronger than the Tug can reach", () => {
    expect(voteCastSchema.safeParse({ ...matchup, value: 3 }).success).toBe(
      false,
    );
    expect(voteCastSchema.safeParse({ ...matchup, value: -3 }).success).toBe(
      false,
    );
  });

  it("refuses an Element matched against itself", () => {
    expect(
      voteCastSchema.safeParse({
        topElementId: 7,
        bottomElementId: 7,
        value: 1,
      }).success,
    ).toBe(false);
  });

  it("refuses an id no Element could have", () => {
    expect(
      voteCastSchema.safeParse({ ...matchup, topElementId: 0, value: 1 })
        .success,
    ).toBe(false);
    expect(
      voteCastSchema.safeParse({ ...matchup, topElementId: 1.5, value: 1 })
        .success,
    ).toBe(false);
  });
});
