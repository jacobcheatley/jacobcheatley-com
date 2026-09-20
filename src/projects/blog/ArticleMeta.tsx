import type { ListedArticle } from "./blog.server";
import { formatPublishDate } from "./publish-date";

// The one muted line an Article carries wherever it is shown. Topics read
// alphabetically, so the same Article always reads the same.
export function ArticleMeta({
  publishAt,
  topics,
}: Pick<ListedArticle, "publishAt" | "topics">) {
  return (
    <p className="mt-[0.35rem] font-sans text-[0.875rem] text-muted">
      {formatPublishDate(publishAt)}
      {topics.length > 0 &&
        ` · ${[...topics].sort((a, b) => a.localeCompare(b)).join(", ")}`}
    </p>
  );
}
