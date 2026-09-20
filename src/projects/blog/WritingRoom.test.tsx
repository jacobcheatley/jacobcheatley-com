import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ArticleSave } from "./article-schema";
import type { EditingArticle, SaveArticleResult } from "./blog-editor.server";
import { WritingRoom } from "./WritingRoom";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => ({
  ...(await import("@/test/router-stub")),
  useNavigate: () => navigate,
}));

afterEach(() => {
  navigate.mockClear();
  vi.restoreAllMocks();
});

const now = new Date("2026-09-20T12:00:00.000Z");

const draft: EditingArticle = {
  id: 7,
  slug: "a-draft",
  title: "A Draft, still being written",
  tagline: "No Publish date, so the site never shows it.",
  body: "## Half a section\n\nAnd then nothing.\n",
  publishAt: null,
  topics: ["Writing"],
};

const published: EditingArticle = {
  ...draft,
  slug: "on-the-site",
  title: "On the site already",
  publishAt: new Date("2026-09-14T09:00:00.000Z"),
};

type SaveArticle = (options: {
  data: { id: number; save: ArticleSave };
}) => Promise<SaveArticleResult>;
type DeleteArticle = (options: { data: number }) => Promise<void>;

// The Blog's Topics: the Draft holds one of them.
const blogTopics = ["Markdown", "Writing"];

const room = ({
  article = draft,
  saveArticle = async () => ({
    ok: true,
    topics: article.topics,
    allTopics: blogTopics,
  }),
  deleteArticle = async () => {},
}: {
  article?: EditingArticle;
  saveArticle?: SaveArticle;
  deleteArticle?: DeleteArticle;
} = {}) =>
  render(
    <WritingRoom
      article={article}
      allTopics={blogTopics}
      database={{ host: "localhost:5432", isLocal: true }}
      now={() => now}
      saveArticle={saveArticle}
      deleteArticle={deleteArticle}
    />,
  );

const titleField = () => screen.getByRole("textbox", { name: "Title" });
const saveButton = () => screen.getByRole("button", { name: /^Save/ });
const field = (name: string) => screen.getByLabelText(name);

// The drawer opens on the button that names the Article's state.
const openDrawer = async (
  owner: ReturnType<typeof userEvent.setup>,
  state: string,
) => owner.click(screen.getByRole("button", { name: `${state} · Details` }));
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
  room({ saveArticle: async () => ({ ok: false, reason: "slugTaken" }) });

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
  room({ saveArticle: () => Promise.reject(new Error("Failed to fetch")) });

  await owner.click(saveButton());

  expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
});

it("saves every field of the Article and clears the marker", async () => {
  const owner = userEvent.setup();
  const saveArticle = vi.fn<SaveArticle>(async () => ({
    ok: true,
    topics: draft.topics,
    allTopics: blogTopics,
  }));
  room({ saveArticle });

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
        topics: draft.topics,
      },
    },
  });
  expect(await screen.findByText("Saved")).toBeVisible();
});

it("keeps the marker when an edit lands while a Save is in flight", async () => {
  const owner = userEvent.setup();
  let finishSave = (_saved: SaveArticleResult) => {};
  room({ saveArticle: () => new Promise((resolve) => (finishSave = resolve)) });

  await owner.type(titleField(), "!");
  await owner.click(saveButton());
  await owner.type(titleField(), " and more");
  finishSave({ ok: true, topics: draft.topics, allTopics: blogTopics });
  await waitFor(() => expect(saveButton()).toBeEnabled());

  expect(screen.getByText("● Unsaved changes")).toBeVisible();
});

it("saves on Ctrl+S", async () => {
  const owner = userEvent.setup();
  const saveArticle = vi.fn<SaveArticle>(async () => ({
    ok: true,
    topics: draft.topics,
    allTopics: blogTopics,
  }));
  room({ saveArticle });

  await owner.type(titleField(), "!");
  await owner.keyboard("{Control>}s{/Control}");

  expect(saveArticle).toHaveBeenCalledOnce();
  expect(await screen.findByText("Saved")).toBeVisible();
});

it("closes the Details drawer on Escape", async () => {
  const owner = userEvent.setup();
  room();
  await openDrawer(owner, "Draft");
  expect(screen.getByRole("complementary", { name: "Details" })).toBeVisible();

  await owner.keyboard("{Escape}");

  expect(
    screen.queryByRole("complementary", { name: "Details" }),
  ).not.toBeInTheDocument();
});

it("warns that a Published Article's old URL will stop working", async () => {
  const owner = userEvent.setup();
  room({ article: published });
  await openDrawer(owner, "Published");
  expect(screen.queryByText(/stop working/)).not.toBeInTheDocument();

  await owner.type(field("Slug"), "-again");

  expect(
    await screen.findByText(
      "Published at /blog/on-the-site: that URL will stop working.",
    ),
  ).toBeVisible();
});

it("says nothing about the URL of a Draft whose slug changes", async () => {
  const owner = userEvent.setup();
  room();
  await openDrawer(owner, "Draft");

  await owner.type(field("Slug"), "-again");

  expect(await screen.findByDisplayValue("a-draft-again")).toBeVisible();
  expect(screen.queryByText(/stop working/)).not.toBeInTheDocument();
});

it("lands a taken slug on the slug field, drawer and all", async () => {
  const owner = userEvent.setup();
  room({ saveArticle: async () => ({ ok: false, reason: "slugTaken" }) });

  await owner.click(saveButton());

  const slug = await screen.findByLabelText("Slug");
  expect(slug).toBeInvalid();
  expect(slug).toHaveAccessibleDescription(
    "Another Article already has this slug.",
  );
});

it("publishes now into the form, naming the Save, without saving", async () => {
  const owner = userEvent.setup();
  const saveArticle = vi.fn<SaveArticle>(async () => ({
    ok: true,
    topics: draft.topics,
    allTopics: blogTopics,
  }));
  room({ saveArticle });
  await openDrawer(owner, "Draft");

  await owner.click(screen.getByRole("button", { name: "Publish now" }));

  expect(await screen.findByText(/^Published: on the site/)).toBeVisible();
  expect(saveButton()).toHaveAccessibleName("Save and publish");
  expect(saveArticle).not.toHaveBeenCalled();
});

it("clears a Published Article's date back to a Draft, without saving", async () => {
  const owner = userEvent.setup();
  const saveArticle = vi.fn<SaveArticle>(async () => ({
    ok: true,
    topics: draft.topics,
    allTopics: blogTopics,
  }));
  room({ article: published, saveArticle });
  await openDrawer(owner, "Published");

  await owner.click(screen.getByRole("button", { name: "Back to Draft" }));

  await waitFor(() => expect(field("Publish date")).toHaveValue(""));
  expect(saveButton()).toHaveAccessibleName("Save and unpublish");
  expect(saveArticle).not.toHaveBeenCalled();
});

it("schedules a date the owner fills in, naming the Save", async () => {
  const owner = userEvent.setup();
  room();
  await openDrawer(owner, "Draft");

  await owner.type(field("Publish date"), "2026-12-25T09:00");

  await waitFor(() =>
    expect(saveButton()).toHaveAccessibleName("Save and schedule"),
  );
});

it("shows every Topic on the Blog as a toggle, the Article's own switched on", async () => {
  const owner = userEvent.setup();
  room();

  await openDrawer(owner, "Draft");

  expect(
    screen.getByRole("button", { name: "Writing", pressed: true }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Markdown", pressed: false }),
  ).toBeVisible();
});

it("adds a Topic typed into the drawer, switched on", async () => {
  const owner = userEvent.setup();
  room();
  await openDrawer(owner, "Draft");

  await owner.type(field("A new Topic"), "Postgres{Enter}");

  expect(
    await screen.findByRole("button", { name: "Postgres", pressed: true }),
  ).toBeVisible();
  expect(field("A new Topic")).toHaveValue("");
});

it("switches on the Topic the Blog already has when its spelling is typed", async () => {
  const owner = userEvent.setup();
  room();
  await openDrawer(owner, "Draft");

  await owner.type(field("A new Topic"), "markdown{Enter}");

  expect(
    await screen.findByRole("button", { name: "Markdown", pressed: true }),
  ).toBeVisible();
  expect(screen.getAllByRole("button", { name: /markdown/i })).toHaveLength(1);
});

it("marks unsaved changes and shows a toggled Topic in the preview", async () => {
  const owner = userEvent.setup();
  room();
  await openDrawer(owner, "Draft");

  await owner.click(screen.getByRole("button", { name: "Markdown" }));

  expect(await screen.findByText("Markdown, Writing")).toBeVisible();
  expect(screen.getByText("\u25cf Unsaved changes")).toBeVisible();
});

it("takes the Blog's spelling of a Topic into the form on a Save", async () => {
  const owner = userEvent.setup();
  room({
    saveArticle: async () => ({
      ok: true,
      topics: ["Writing", "Postgres"],
      allTopics: [...blogTopics, "Postgres"],
    }),
  });
  await openDrawer(owner, "Draft");
  await owner.type(field("A new Topic"), "postgres{Enter}");

  await owner.click(saveButton());

  expect(
    await screen.findByRole("button", { name: "Postgres", pressed: true }),
  ).toBeVisible();
  expect(screen.getByText("Saved")).toBeVisible();
  expect(screen.getAllByRole("button", { name: /postgres/i })).toHaveLength(1);
});

it("drops a Topic the Save left on no Article from the toggles", async () => {
  const owner = userEvent.setup();
  room({
    article: { ...draft, topics: ["Markdown", "Writing"] },
    saveArticle: async () => ({
      ok: true,
      topics: ["Writing"],
      allTopics: ["Writing"],
    }),
  });
  await openDrawer(owner, "Draft");
  await owner.click(screen.getByRole("button", { name: "Markdown" }));

  await owner.click(saveButton());

  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Markdown" }),
    ).not.toBeInTheDocument(),
  );
});

it("deletes the Article on a confirmation and goes back to the index", async () => {
  const owner = userEvent.setup();
  const deleteArticle = vi.fn<DeleteArticle>(async () => {});
  vi.spyOn(window, "confirm").mockReturnValue(true);
  room({ deleteArticle });
  await openDrawer(owner, "Draft");

  await owner.click(
    screen.getByRole("button", { name: "Delete this Article" }),
  );

  expect(deleteArticle).toHaveBeenCalledWith({ data: 7 });
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({ to: "/blog/write" }),
  );
});

it("keeps the Article when the confirmation is refused", async () => {
  const owner = userEvent.setup();
  const deleteArticle = vi.fn<DeleteArticle>(async () => {});
  vi.spyOn(window, "confirm").mockReturnValue(false);
  room({ deleteArticle });
  await openDrawer(owner, "Draft");

  await owner.click(
    screen.getByRole("button", { name: "Delete this Article" }),
  );

  expect(deleteArticle).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
