import { describe, expect, it } from "vitest";
import { articleState } from "./article-state";

const now = new Date("2026-09-20T12:00:00.000Z");

describe("articleState", () => {
  it("calls an Article with no Publish date a Draft", () => {
    expect(articleState(null, now)).toBe("draft");
  });

  it("calls an Article whose Publish date has not arrived Scheduled", () => {
    expect(articleState(new Date(now.getTime() + 1), now)).toBe("scheduled");
  });

  it("calls an Article Published the moment its Publish date arrives", () => {
    expect(articleState(new Date(now), now)).toBe("published");
  });

  it("calls an Article with a past Publish date Published", () => {
    expect(articleState(new Date(now.getTime() - 1), now)).toBe("published");
  });
});
