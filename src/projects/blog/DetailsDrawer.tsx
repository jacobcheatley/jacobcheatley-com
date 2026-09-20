import { useEffect, useRef } from "react";
import { type ArticleSave, SLUG_PATTERN } from "./article-schema";
import { articleState } from "./article-state";
import {
  formatPublishDate,
  fromDateTimeLocal,
  toDateTimeLocal,
} from "./publish-date";

const FIELD = "grid min-w-0 gap-[0.25rem]";
const LABEL = "text-[0.75rem] text-muted";
const INPUT = "rounded-sm border border-line bg-surface px-2 py-[0.35rem]";
const BUTTON =
  "rounded-sm border border-line bg-surface px-[0.7rem] py-[0.35rem] hover:border-muted";

// The Article as the form would leave it, in the words a reader would get.
function publishingSentence(publishAt: Date | null, now: Date) {
  if (!publishAt) return "A Draft: not on the site.";
  const shownAs = formatPublishDate(publishAt);
  return articleState(publishAt, now) === "scheduled"
    ? `Scheduled: appears on ${shownAs}.`
    : `Published: on the site, dated ${shownAs}.`;
}

export function DetailsDrawer({
  save,
  stored,
  now,
  slugProblem,
  edit,
  deleteArticle,
  close,
}: {
  save: ArticleSave;
  stored: ArticleSave;
  now: Date;
  slugProblem: string;
  edit: (fields: Partial<ArticleSave>) => void;
  deleteArticle: () => void;
  close: () => void;
}) {
  const publishField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close]);

  // Only a Published Article has a URL a reader may already be holding.
  const staleUrl =
    articleState(stored.publishAt, now) === "published" &&
    save.slug !== stored.slug
      ? `Published at /blog/${stored.slug}: that URL will stop working.`
      : "";

  function schedule() {
    const field = publishField.current;
    if (!field) return;
    field.focus();
    // jsdom has no picker to open, and the browser's is the whole button.
    if (typeof field.showPicker === "function") field.showPicker();
  }

  return (
    <aside
      aria-label="Details"
      className="absolute inset-y-0 right-0 z-10 grid w-[22rem] content-start gap-[1.1rem] overflow-y-auto border-line border-l bg-paper p-5 shadow-[-12px_0_24px_rgb(0_0_0/0.08)]"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-[1.125rem]">Details</h2>
        <button type="button" onClick={close} className={BUTTON}>
          Close
        </button>
      </div>

      <div className={FIELD}>
        <label className={LABEL} htmlFor="article-slug">
          Slug
        </label>
        <input
          id="article-slug"
          className={`${INPUT} font-mono text-[0.8125rem]`}
          defaultValue={save.slug}
          maxLength={80}
          pattern={SLUG_PATTERN.source}
          required
          aria-invalid={slugProblem !== ""}
          aria-describedby={slugProblem ? "slug-problem" : undefined}
          onChange={(event) => edit({ slug: event.target.value })}
        />
        {slugProblem && (
          <p id="slug-problem" className="text-name">
            {slugProblem}
          </p>
        )}
        {staleUrl && <p className="text-accent-2">{staleUrl}</p>}
      </div>

      <label className={FIELD}>
        <span className={LABEL}>Tagline</span>
        <textarea
          className={`${INPUT} resize-y`}
          defaultValue={save.tagline}
          rows={3}
          maxLength={160}
          required
          onChange={(event) => edit({ tagline: event.target.value })}
        />
      </label>

      <div className={FIELD}>
        <span className={LABEL}>Publishing</span>
        <p>{publishingSentence(save.publishAt, now)}</p>
        <span className="flex flex-wrap gap-[0.35rem] py-[0.35rem]">
          <button
            type="button"
            className={BUTTON}
            onClick={() => edit({ publishAt: now })}
          >
            Publish now
          </button>
          <button type="button" className={BUTTON} onClick={schedule}>
            Schedule…
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => edit({ publishAt: null })}
          >
            Back to Draft
          </button>
        </span>
        <input
          ref={publishField}
          type="datetime-local"
          aria-label="Publish date"
          className={INPUT}
          value={save.publishAt ? toDateTimeLocal(save.publishAt) : ""}
          onChange={(event) =>
            edit({ publishAt: fromDateTimeLocal(event.target.value) })
          }
        />
      </div>

      <div>
        <button
          type="button"
          onClick={deleteArticle}
          className={`${BUTTON} text-name`}
        >
          Delete this Article
        </button>
      </div>
    </aside>
  );
}
