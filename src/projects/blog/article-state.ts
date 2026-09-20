export type ArticleState = "draft" | "scheduled" | "published";

// The Blog stores no status: the Publish date is the state. The comparison is
// the inclusive one the visibility rule uses in SQL, so the editor never
// disagrees with what a reader gets.
export function articleState(
  publishAt: Date | null,
  now: Date,
): ArticleState {
  if (!publishAt) return "draft";
  return publishAt.getTime() <= now.getTime() ? "published" : "scheduled";
}
