import { expect, it } from "vitest";
import {
  formatPublishDate,
  fromDateTimeLocal,
  toDateTimeLocal,
} from "./publish-date";

it("dates an Article by the Blog's zone, not the server's", () => {
  expect(formatPublishDate(new Date("2026-09-20T11:30:00Z"))).toBe(
    "20 September 2026",
  );
  expect(formatPublishDate(new Date("2026-09-20T12:30:00Z"))).toBe(
    "21 September 2026",
  );
});

it("fills the Publish date field with the owner's own clock, to the minute", () => {
  expect(toDateTimeLocal(new Date(2026, 8, 20, 9, 5, 45))).toBe(
    "2026-09-20T09:05",
  );
});

it("reads the Publish date field back as the moment it shows", () => {
  expect(fromDateTimeLocal("2026-09-20T09:05")).toEqual(
    new Date(2026, 8, 20, 9, 5),
  );
});

it("reads an empty Publish date field as a Draft", () => {
  expect(fromDateTimeLocal("")).toBeNull();
});
