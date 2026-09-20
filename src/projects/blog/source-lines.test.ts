import { expect, it } from "vitest";
import { type PreviewLayout, previewScrollTop } from "./source-lines";

// A paragraph on line 1, a ten-line fence drawn tall, and a last paragraph:
// what makes the preview drift out of step with the source.
const preview: PreviewLayout = {
  blocks: [
    { startLine: 1, endLine: 1, offsetTop: 100, height: 40 },
    { startLine: 3, endLine: 12, offsetTop: 160, height: 200 },
    { startLine: 14, endLine: 14, offsetTop: 380, height: 40 },
  ],
  maxScrollTop: 1000,
};

it("holds the preview at the top while the source is at the top", () => {
  expect(
    previewScrollTop({ topLine: 1, scrollTop: 0, maxScrollTop: 600 }, preview),
  ).toBe(0);
});

it("takes the preview to the bottom when the source is at the bottom", () => {
  expect(
    previewScrollTop(
      { topLine: 14, scrollTop: 600, maxScrollTop: 600 },
      preview,
    ),
  ).toBe(1000);
});

it("carries the preview through a block as the source scrolls through it", () => {
  expect(
    previewScrollTop(
      { topLine: 8, scrollTop: 200, maxScrollTop: 600 },
      preview,
    ),
  ).toBe(260);
});

it("holds at the foot of the block above a line that is in none", () => {
  expect(
    previewScrollTop(
      { topLine: 13, scrollTop: 340, maxScrollTop: 600 },
      preview,
    ),
  ).toBe(360);
});

it("holds the preview at the top of an Article with nothing to scroll to", () => {
  expect(
    previewScrollTop(
      { topLine: 4, scrollTop: 40, maxScrollTop: 600 },
      { blocks: [], maxScrollTop: 0 },
    ),
  ).toBe(0);
});
