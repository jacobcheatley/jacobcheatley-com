import { formatPublishDate } from "./publish-date";

// The one muted line an Article carries wherever it is shown. Topics read
// alphabetically, so the same Article always reads the same. A Draft has no
// Publish date, so in the editor's preview the line is its Topics alone.
export function ArticleMeta({
  publishAt,
  topics,
}: {
  publishAt: Date | null;
  topics: string[];
}) {
  const parts = [
    publishAt ? formatPublishDate(publishAt) : "",
    [...topics].sort((a, b) => a.localeCompare(b)).join(", "),
  ];
  return (
    <p className="mt-[0.35rem] font-sans text-[0.875rem] text-muted">
      {parts.filter((part) => part !== "").join(" · ")}
    </p>
  );
}
