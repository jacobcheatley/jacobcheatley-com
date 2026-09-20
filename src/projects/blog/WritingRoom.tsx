import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArticleView } from "./ArticleView";
import { type ArticleSave, articleSaveSchema } from "./article-schema";
import { type ArticleState, articleState, saveLabel } from "./article-state";
import type {
  EditingArticle,
  EditorDatabase,
  SaveArticleResult,
} from "./blog-editor.server";
import { DatabaseLabel } from "./DatabaseLabel";
import { DetailsDrawer } from "./DetailsDrawer";
import { ArticleSurfaceContext } from "./Mermaid";
import { SourcePane } from "./SourcePane";
import { followSourceScroll, type SourceScroll } from "./source-lines";

const LAYOUTS = ["source", "split", "preview"] as const;
type RoomLayout = (typeof LAYOUTS)[number];
const LAYOUT_LABELS: Record<RoomLayout, string> = {
  source: "Source",
  split: "Split",
  preview: "Preview",
};

const STATE_WORDS: Record<ArticleState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
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

// What the room may write back: everything a Save sends.
const savedFields = (article: EditingArticle): ArticleSave => ({
  title: article.title,
  slug: article.slug,
  tagline: article.tagline,
  body: article.body,
  publishAt: article.publishAt,
  topics: article.topics,
});

export function WritingRoom({
  article,
  database,
  allTopics,
  now,
  saveArticle,
  deleteArticle,
}: {
  article: EditingArticle;
  database: EditorDatabase;
  allTopics: string[];
  // Read at every render: a Scheduled date that arrives while the room is open
  // renames the Save button without a reload.
  now: () => Date;
  saveArticle: (options: {
    data: { id: number; save: ArticleSave };
  }) => Promise<SaveArticleResult>;
  deleteArticle: (options: { data: number }) => Promise<void>;
}) {
  const navigate = useNavigate();
  // What the owner has written, against what the preview is showing: the
  // fields own their text, so a Save always sends the latest keystroke even
  // when the frame that renders it has not come round yet.
  const written = useRef(savedFields(article));
  // The pane the preview scrolls in, which the source pane steers.
  const preview = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(written.current);
  const previewFrame = useRef(0);
  // The form as the last Save sent it: the slug the site is serving and the
  // Publish date it is going by.
  const [stored, setStored] = useState(written.current);
  // Every Topic on the Blog as the last Save left them: one it took off the
  // Blog is gone from the toggles without a reload.
  const [blogTopics, setBlogTopics] = useState(allTopics);
  const [hasUnsavedChanges, setUnsavedChanges] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [isSlugTaken, setSlugTaken] = useState(false);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
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
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const followSource = useCallback((source: SourceScroll) => {
    if (preview.current) followSourceScroll(preview.current, source);
  }, []);

  const save = useCallback(async () => {
    setProblem("");
    setSlugTaken(false);
    const sending = written.current;
    const parsed = articleSaveSchema.safeParse(sending);
    // The three fields the owner can leave in a shape the schema refuses; the
    // body and the Publish date cannot be malformed.
    if (!parsed.success)
      return setProblem(
        "An Article needs a title, a Tagline and a slug of lowercase words.",
      );

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
    if (!saved.ok) {
      setProblem(SAVE_PROBLEMS[saved.reason]);
      setSlugTaken(saved.reason === "slugTaken");
      // The slug is the drawer's field: open it so the refusal is where the
      // fix is.
      if (saved.reason === "slugTaken") setDrawerOpen(true);
      return;
    }
    // The Blog's own spelling of a Topic won, so the form takes it back.
    const settled = { ...sending, topics: saved.topics };
    // An edit that landed while the Save was in flight is still unsaved: every
    // edit replaces the written fields with a new object.
    const isStale = written.current !== sending;
    if (!isStale) {
      written.current = settled;
      setShown(settled);
    }
    setStored(settled);
    setUnsavedChanges(isStale);
    setBlogTopics(saved.allTopics);
  }, [article.id, saveArticle]);

  const remove = useCallback(async () => {
    if (!window.confirm(`Delete “${article.title}”? This cannot be undone.`))
      return;
    try {
      await deleteArticle({ data: article.id });
    } catch (error) {
      // The same one failure a Save has: the editor could not reach its
      // database, and the message is the whole report.
      if (!(error instanceof Error)) throw error;
      return setProblem(error.message);
    }
    await navigate({ to: "/blog/write" });
  }, [article.id, article.title, deleteArticle, navigate]);

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

  // One clock a render, so the drawer's sentence and the Save button agree.
  const clock = now();
  const formState = articleState(shown.publishAt, clock);

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
          aria-expanded={isDrawerOpen}
          onClick={() => setDrawerOpen(!isDrawerOpen)}
          className={`${BUTTON} whitespace-nowrap`}
        >
          {STATE_WORDS[formState]} · Details
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving}
          className="whitespace-nowrap rounded-sm border border-transparent bg-accent px-3 py-[0.35rem] font-semibold text-paper disabled:opacity-60"
        >
          {saveLabel(articleState(stored.publishAt, clock), formState)}
        </button>
        <DatabaseLabel {...database} />
      </header>

      <div
        className={`relative grid min-h-0 ${layout === "split" ? "grid-cols-2" : "grid-cols-1"}`}
      >
        <div
          hidden={layout === "preview"}
          className="min-h-0 min-w-0 overflow-hidden border-line border-r"
        >
          <SourcePane
            initialMarkdown={article.body}
            onChange={writeBody}
            onScroll={followSource}
          />
        </div>
        <div
          ref={preview}
          hidden={layout === "source"}
          className="min-h-0 min-w-0 overflow-y-auto font-serif text-[1.0625rem] leading-[1.5]"
        >
          <ArticleSurfaceContext value="editor">
            <ArticleView article={{ ...article, ...shown }} />
          </ArticleSurfaceContext>
        </div>
        {isDrawerOpen && (
          <DetailsDrawer
            save={shown}
            stored={stored}
            allTopics={blogTopics}
            now={clock}
            slugProblem={isSlugTaken ? SAVE_PROBLEMS.slugTaken : ""}
            edit={edit}
            deleteArticle={() => void remove()}
            close={closeDrawer}
          />
        )}
      </div>
    </div>
  );
}
