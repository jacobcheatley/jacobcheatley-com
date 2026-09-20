import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { ArticleSave } from "./article-schema";
import type { EditingArticle, SaveArticleResult } from "./blog-editor.server";
import { WritingRoom } from "./WritingRoom";

vi.mock("@tanstack/react-router", () => import("@/test/router-stub"));

const draft: EditingArticle = {
  id: 7,
  slug: "a-draft",
  title: "A Draft, still being written",
  tagline: "No Publish date, so the site never shows it.",
  body: "## Half a section\n\nAnd then nothing.\n",
  publishAt: null,
  topics: ["Writing"],
};

type SaveArticle = (options: {
  data: { id: number; save: ArticleSave };
}) => Promise<SaveArticleResult>;

const room = (saveArticle: SaveArticle = async () => ({ ok: true })) =>
  render(
    <WritingRoom
      article={draft}
      database={{ host: "localhost:5432", isLocal: true }}
      saveArticle={saveArticle}
    />,
  );

const titleField = () => screen.getByRole("textbox", { name: "Title" });
const saveButton = () => screen.getByRole("button", { name: "Save" });
// CodeMirror's own element: what the owner's Markdown source reads as.
const source = () =>
  document.querySelector(".cm-content")?.textContent ?? "no source pane";

it("previews the Article's body as a reader would get it", () => {
  room();

  expect(
    screen.getByRole("heading", { level: 2, name: /Half a section/ }),
  ).toBeVisible();
  expect(source()).toContain("## Half a section");
});

it("marks unsaved changes and retitles the preview as the title is edited", async () => {
  const owner = userEvent.setup();
  room();
  expect(screen.getByText("Saved")).toBeVisible();

  await owner.clear(titleField());
  await owner.type(titleField(), "A Draft, renamed");

  expect(screen.getByText("● Unsaved changes")).toBeVisible();
  expect(
    await screen.findByRole("heading", { level: 1, name: "A Draft, renamed" }),
  ).toBeVisible();
});

it("keeps the source and the marker when a Save is refused, and names the refusal", async () => {
  const owner = userEvent.setup();
  room(async () => ({ ok: false, reason: "slugTaken" }));

  await owner.type(titleField(), "!");
  await owner.click(saveButton());

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Another Article already has this slug.",
  );
  expect(screen.getByText("● Unsaved changes")).toBeVisible();
  expect(source()).toContain("And then nothing.");
});

it("reports a Save that never reached the database", async () => {
  const owner = userEvent.setup();
  room(() => Promise.reject(new Error("Failed to fetch")));

  await owner.click(saveButton());

  expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
});

it("saves every field of the Article and clears the marker", async () => {
  const owner = userEvent.setup();
  const saveArticle = vi.fn<SaveArticle>(async () => ({ ok: true }));
  room(saveArticle);

  await owner.clear(titleField());
  await owner.type(titleField(), "A Draft, renamed");
  await owner.click(saveButton());

  expect(saveArticle).toHaveBeenCalledWith({
    data: {
      id: 7,
      save: {
        title: "A Draft, renamed",
        slug: draft.slug,
        tagline: draft.tagline,
        body: draft.body,
        publishAt: null,
      },
    },
  });
  expect(await screen.findByText("Saved")).toBeVisible();
});

it("keeps the marker when an edit lands while a Save is in flight", async () => {
  const owner = userEvent.setup();
  let finishSave = (_saved: SaveArticleResult) => {};
  room(() => new Promise((resolve) => (finishSave = resolve)));

  await owner.type(titleField(), "!");
  await owner.click(saveButton());
  await owner.type(titleField(), " and more");
  finishSave({ ok: true });
  await waitFor(() => expect(saveButton()).toBeEnabled());

  expect(screen.getByText("● Unsaved changes")).toBeVisible();
});

it("saves on Ctrl+S", async () => {
  const owner = userEvent.setup();
  const saveArticle = vi.fn<SaveArticle>(async () => ({ ok: true }));
  room(saveArticle);

  await owner.type(titleField(), "!");
  await owner.keyboard("{Control>}s{/Control}");

  expect(saveArticle).toHaveBeenCalledOnce();
  expect(await screen.findByText("Saved")).toBeVisible();
});
