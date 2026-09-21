import { describe, expect, it } from "vitest";
import { INK, PAPER, textOn } from "./element-colour";

describe("textOn", () => {
  it("writes in ink on a light Element", () => {
    expect(textOn("#fffbe0")).toBe(INK); // light
    expect(textOn("#f4f1e6")).toBe(INK); // paper
    expect(textOn("#e3c58a")).toBe(INK); // sand
  });

  it("writes in white on a dark Element", () => {
    expect(textOn("#2b2440")).toBe(PAPER); // dark
    expect(textOn("#f2541b")).toBe(PAPER); // fire
    expect(textOn("#2f7fe0")).toBe(PAPER); // water
  });

  it("takes black and white as the two ends they are", () => {
    expect(textOn("#000000")).toBe(PAPER);
    expect(textOn("#ffffff")).toBe(INK);
  });
});
