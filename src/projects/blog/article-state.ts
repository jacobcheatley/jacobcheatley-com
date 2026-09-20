export type ArticleState = "draft" | "scheduled" | "published";

// The Blog stores no status: the Publish date is the state. The comparison is
// the inclusive one the visibility rule uses in SQL, so the editor never
// disagrees with what a reader gets.
export function articleState(publishAt: Date | null, now: Date): ArticleState {
  if (!publishAt) return "draft";
  return publishAt.getTime() <= now.getTime() ? "published" : "scheduled";
}

// What pressing Save does to the live site: every state the Article is stored
// in against every state the form would leave it in. Giving a Published
// Article a date still to come takes it off the site until that date arrives.
const SAVE_LABELS: Record<ArticleState, Record<ArticleState, string>> = {
  draft: {
    draft: "Save Draft",
    scheduled: "Save and schedule",
    published: "Save and publish",
  },
  scheduled: {
    draft: "Save Draft",
    scheduled: "Save and schedule",
    published: "Save and publish",
  },
  published: {
    draft: "Save and unpublish",
    scheduled: "Save and unpublish",
    published: "Save to the live site",
  },
};

export const saveLabel = (stored: ArticleState, form: ArticleState) =>
  SAVE_LABELS[stored][form];
