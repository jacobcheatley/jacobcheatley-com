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
