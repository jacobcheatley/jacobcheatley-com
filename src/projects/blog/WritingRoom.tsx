import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArticleView } from "./ArticleView";
import { type ArticleSave, articleSaveSchema } from "./article-schema";
import type {
  EditingArticle,
  EditorDatabase,
  SaveArticleResult,
} from "./blog-editor.server";
import { DatabaseLabel } from "./DatabaseLabel";
import { SourcePane } from "./SourcePane";

const LAYOUTS = ["source", "split", "preview"] as const;
type RoomLayout = (typeof LAYOUTS)[number];
const LAYOUT_LABELS: Record<RoomLayout, string> = {
  source: "Source",
  split: "Split",
  preview: "Preview",
};

const SAVE_PROBLEMS: Record<
  Extract<SaveArticleResult, { ok: false }>["reason"],
  string
> = {
  slugTaken: "Another Article already has this slug.",
  articleGone: "This Article is no longer in the database.",
};

const BUTTON =
  "rounded-sm border border-line bg-surface px-[0.7rem] py-[0.35rem] hover:border-muted";

// What the room may write back: the Article's own fields, its Topics apart.
const savedFields = (article: EditingArticle): ArticleSave => ({
  title: article.title,
  slug: article.slug,
  tagline: article.tagline,
  body: article.body,
  publishAt: article.publishAt,
});

export function WritingRoom({
  article,
  database,
  saveArticle,
}: {
  article: EditingArticle;
  database: EditorDatabase;
  saveArticle: (options: {
    data: { id: number; save: ArticleSave };
  }) => Promise<SaveArticleResult>;
}) {
  // What the owner has written, against what the preview is showing: the
  // fields own their text, so a Save always sends the latest keystroke even
  // when the frame that renders it has not come round yet.
  const written = useRef(savedFields(article));
  const [shown, setShown] = useState(written.current);
  const previewFrame = useRef(0);
  const [hasUnsavedChanges, setUnsavedChanges] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [layout, setLayout] = useState<RoomLayout>("split");

  const edit = useCallback((fields: Partial<ArticleSave>) => {
    written.current = { ...written.current, ...fields };
    setUnsavedChanges(true);
    // One animation frame, so a burst of typing renders the Article once.
    cancelAnimationFrame(previewFrame.current);
    previewFrame.current = requestAnimationFrame(() =>
      setShown(written.current),
    );
  }, []);

  const writeBody = useCallback((body: string) => edit({ body }), [edit]);

  const save = useCallback(async () => {
    setProblem("");
    const sending = written.current;
    const parsed = articleSaveSchema.safeParse(sending);
    // Every other field came from the database and is edited in the Details
    // drawer; an emptied title is what this room is left to catch.
    if (!parsed.success) return setProblem("A title is required.");

    setSaving(true);
    let saved: SaveArticleResult;
    try {
      saved = await saveArticle({
        data: { id: article.id, save: parsed.data },
      });
    } catch (error) {
      // The one thing that can fail without an answer: the editor could not
      // reach its database. Its message is the whole report.
      if (!(error instanceof Error)) throw error;
      return setProblem(error.message);
    } finally {
      setSaving(false);
    }
    if (!saved.ok) return setProblem(SAVE_PROBLEMS[saved.reason]);
    // An edit that landed while the Save was in flight is still unsaved: every
    // edit replaces the written fields with a new object.
    setUnsavedChanges(written.current !== sending);
  }, [article.id, saveArticle]);

  useEffect(() => {
    const saveOnKey = (event: KeyboardEvent) => {
      if (event.key !== "s" || !(event.ctrlKey || event.metaKey)) return;
      // Otherwise the browser offers to save the page instead.
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", saveOnKey);
    return () => window.removeEventListener("keydown", saveOnKey);
  }, [save]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] font-sans text-[0.875rem] leading-[1.35]">
      <header className="flex items-center gap-3 border-line border-b px-4 py-2">
        <Link
          to="/blog/write"
          className="whitespace-nowrap text-muted no-underline hover:text-accent"
        >
          ← Articles
        </Link>
        <input
          aria-label="Title"
          defaultValue={article.title}
          maxLength={120}
          onChange={(event) => edit({ title: event.target.value })}
          className="min-w-0 flex-1 border-line border-b border-dashed bg-transparent py-[0.2rem] font-serif text-[1.375rem]"
        />
        {problem && (
          <p role="alert" className="text-name">
            {problem}
          </p>
        )}
        <span
          className={`whitespace-nowrap ${hasUnsavedChanges ? "text-accent-2" : "text-muted"}`}
        >
          {hasUnsavedChanges ? "● Unsaved changes" : "Saved"}
        </span>
        <span className="flex gap-[0.35rem]">
          {LAYOUTS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={name === layout}
              onClick={() => setLayout(name)}
              className={`${BUTTON} ${name === layout ? "border-accent! text-accent" : ""}`}
            >
              {LAYOUT_LABELS[name]}
            </button>
          ))}
        </span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving}
          className="rounded-sm border border-transparent bg-accent px-3 py-[0.35rem] font-semibold text-paper disabled:opacity-60"
        >
          Save
        </button>
        <DatabaseLabel {...database} />
      </header>

      <div
        className={`grid min-h-0 ${layout === "split" ? "grid-cols-2" : "grid-cols-1"}`}
      >
        <div
          hidden={layout === "preview"}
          className="min-h-0 min-w-0 overflow-hidden border-line border-r"
        >
          <SourcePane initialMarkdown={article.body} onChange={writeBody} />
        </div>
        <div
          hidden={layout === "source"}
          className="min-h-0 min-w-0 overflow-y-auto font-serif text-[1.0625rem] leading-[1.5]"
        >
          <ArticleView article={{ ...article, ...shown }} />
        </div>
      </div>
    </div>
  );
}
