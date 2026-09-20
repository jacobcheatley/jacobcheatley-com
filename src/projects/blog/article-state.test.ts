import { describe, expect, it } from "vitest";
import { articleState, saveLabel } from "./article-state";

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

describe("saveLabel", () => {
  it("names a save that leaves the Article where it stands", () => {
    expect(saveLabel("draft", "draft")).toBe("Save Draft");
    expect(saveLabel("scheduled", "scheduled")).toBe("Save and schedule");
    expect(saveLabel("published", "published")).toBe("Save to the live site");
  });

  it("names putting an Article that is not on the site on it", () => {
    expect(saveLabel("draft", "published")).toBe("Save and publish");
    expect(saveLabel("scheduled", "published")).toBe("Save and publish");
  });

  it("names dating an Article that is not on the site yet", () => {
    expect(saveLabel("draft", "scheduled")).toBe("Save and schedule");
  });

  it("names taking a Published Article off the site, dated or not", () => {
    expect(saveLabel("published", "draft")).toBe("Save and unpublish");
    expect(saveLabel("published", "scheduled")).toBe("Save and unpublish");
  });

  it("names clearing the date of an Article that never reached the site", () => {
    expect(saveLabel("scheduled", "draft")).toBe("Save Draft");
  });
});
