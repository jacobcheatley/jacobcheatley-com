import { Link, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import {
  type ArticleDraft,
  articleDraftSchema,
  SLUG_PATTERN,
  slugify,
} from "./article-schema";
import { type ArticleState, articleState } from "./article-state";
import type {
  CreateArticleResult,
  EditorArticle,
  EditorDatabase,
} from "./blog-editor.server";
import { DatabaseLabel } from "./DatabaseLabel";
import { formatPublishDate } from "./publish-date";

// In each group, what the owner works on next comes first: the newest Draft,
// the Article going out soonest, the piece published last.
const GROUPS: {
  state: ArticleState;
  heading: string;
  first: (a: EditorArticle, b: EditorArticle) => number;
}[] = [
  { state: "draft", heading: "Drafts", first: (a, b) => b.id - a.id },
  {
    state: "scheduled",
    heading: "Scheduled",
    first: (a, b) => publishedAt(a) - publishedAt(b),
  },
  {
    state: "published",
    heading: "Published",
    first: (a, b) => publishedAt(b) - publishedAt(a),
  },
];

// Only the two dated groups sort on it, so a Draft's missing date never counts.
const publishedAt = (article: EditorArticle) =>
  article.publishAt?.getTime() ?? 0;

const SLUG_TAKEN = "Another Article already has this slug.";
const SLUG_SHAPE = "Lowercase letters, digits and single hyphens only.";

const FIELD = "grid gap-[0.2rem] min-w-0";
const LABEL = "text-[0.75rem] text-muted";
const INPUT = "rounded-sm border border-line bg-surface px-2 py-[0.35rem]";

export function ArticleIndex({
  articles,
  database,
  now,
  createArticle,
}: {
  articles: EditorArticle[];
  database: EditorDatabase;
  now: Date;
  createArticle: (options: {
    data: ArticleDraft;
  }) => Promise<CreateArticleResult>;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  // Until the owner edits it, the slug is the title's; afterwards it is theirs.
  const [isSlugOwned, setSlugOwned] = useState(false);
  const [slugProblem, setSlugProblem] = useState("");

  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSlugProblem("");
    const save = articleDraftSchema.safeParse({
      title,
      slug,
      tagline,
      body: "",
      publishAt: null,
    });
    // The fields' own required and maxLength refuse the rest before a submit;
    // the slug's shape is what the schema is left to catch.
    if (!save.success) return setSlugProblem(SLUG_SHAPE);
    const created = await createArticle({ data: save.data });
    if (!created.ok) return setSlugProblem(SLUG_TAKEN);
    await navigate({
      to: "/blog/write/$id",
      params: { id: String(created.id) },
    });
  }

  return (
    <main className="mx-auto w-full max-w-[58rem] px-4 py-10 font-sans text-[0.875rem] leading-[1.35]">
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="font-serif text-[2rem] font-medium italic">Articles</h1>
        <DatabaseLabel {...database} />
      </header>

      <form
        onSubmit={create}
        className="mb-8 grid grid-cols-[2fr_1.5fr_3fr_auto] items-end gap-3 border-b border-line pb-6"
      >
        <label className={FIELD}>
          <span className={LABEL}>Title</span>
          <input
            className={INPUT}
            value={title}
            maxLength={120}
            required
            onChange={(event) => {
              setTitle(event.target.value);
              if (!isSlugOwned) setSlug(slugify(event.target.value));
            }}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Slug</span>
          <input
            className={`${INPUT} font-mono text-[0.8125rem]`}
            value={slug}
            maxLength={80}
            pattern={SLUG_PATTERN.source}
            required
            aria-invalid={slugProblem !== ""}
            aria-describedby={slugProblem ? "slug-problem" : undefined}
            onChange={(event) => {
              setSlugOwned(true);
              setSlug(event.target.value);
            }}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Tagline</span>
          <input
            className={INPUT}
            value={tagline}
            maxLength={160}
            required
            onChange={(event) => setTagline(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="rounded-sm border border-transparent bg-accent px-3 py-[0.35rem] font-semibold text-paper"
        >
          Create Draft
        </button>
        {slugProblem && (
          <p id="slug-problem" className="col-span-full text-name">
            {slugProblem}
          </p>
        )}
      </form>

      <table className="w-full border-collapse">
        {GROUPS.map(({ state, heading, first }) => (
          <tbody key={state}>
            <tr>
              <th
                scope="col"
                className="pt-5 pb-[0.35rem] text-left text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-muted"
                colSpan={3}
              >
                {heading}
              </th>
            </tr>
            {articles
              .filter(
                (article) => articleState(article.publishAt, now) === state,
              )
              .sort(first)
              .map((article) => (
                <tr key={article.id} className="border-t border-line">
                  <td className="py-[0.6rem] pr-4 align-baseline">
                    <Link
                      to="/blog/write/$id"
                      params={{ id: String(article.id) }}
                      className="font-serif text-[1.1875rem] no-underline hover:text-accent hover:underline"
                    >
                      {article.title}
                    </Link>
                    <span className="block text-muted">{article.tagline}</span>
                  </td>
                  <td className="py-[0.6rem] pr-4 align-baseline whitespace-nowrap">
                    {article.publishAt && formatPublishDate(article.publishAt)}
                  </td>
                  <td className="py-[0.6rem] align-baseline text-muted">
                    {[...article.topics]
                      .sort((a, b) => a.localeCompare(b))
                      .join(", ")}
                  </td>
                </tr>
              ))}
          </tbody>
        ))}
      </table>
    </main>
  );
}
