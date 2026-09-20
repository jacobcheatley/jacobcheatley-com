import { expect, it } from "vitest";
import { formatPublishDate } from "./publish-date";

it("dates an Article by the Blog's zone, not the server's", () => {
  expect(formatPublishDate(new Date("2026-09-20T11:30:00Z"))).toBe(
    "20 September 2026",
  );
  expect(formatPublishDate(new Date("2026-09-20T12:30:00Z"))).toBe(
    "21 September 2026",
  );
});
