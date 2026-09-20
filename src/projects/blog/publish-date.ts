// The Blog dates everything where it is written, so a server anywhere and a
// reader anywhere see the one string and hydration matches.
const BLOG_TIME_ZONE = "Pacific/Auckland";

const publishDateFormat = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: BLOG_TIME_ZONE,
});

export const formatPublishDate = (publishAt: Date) =>
  publishDateFormat.format(publishAt);

// A `datetime-local` field holds `YYYY-MM-DDTHH:mm` with no zone: it is the
// wall clock where the owner is writing. Shifting by the offset puts that wall
// clock in the ISO string, which Date reads back as local time.
export function toDateTimeLocal(publishAt: Date): string {
  const offsetMs = publishAt.getTimezoneOffset() * 60_000;
  return new Date(publishAt.getTime() - offsetMs).toISOString().slice(0, 16);
}

export const fromDateTimeLocal = (field: string): Date | null =>
  field ? new Date(field) : null;
