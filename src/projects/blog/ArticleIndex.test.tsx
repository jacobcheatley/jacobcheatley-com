import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ArticleIndex } from "./ArticleIndex";
import type { ArticleSave } from "./article-schema";
import type { CreateArticleResult, EditorArticle } from "./blog-editor.server";

// The router and the create endpoint don't belong in jsdom: stub them at the
// seams. `vi.mock` is hoisted above these declarations, so the factory has to
// read them lazily.
const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => ({
  ...(await import("@/test/router-stub")),
  useNavigate: () => navigate,
}));

beforeEach(() => navigate.mockClear());

const now = new Date("2026-09-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const article = (fields: Partial<EditorArticle>): EditorArticle => ({
  id: 1,
  slug: "an-article",
  title: "An Article",
  tagline: "One line about it.",
  publishAt: null,
  topics: [],
  ...fields,
});

const index = (
  articles: EditorArticle[],
  createArticle: (options: {
    data: ArticleSave;
  }) => Promise<CreateArticleResult> = async () => ({ ok: true, id: 12 }),
) =>
  render(
    <ArticleIndex
      articles={articles}
      database={{ host: "localhost:5432", isLocal: true }}
      now={now}
      createArticle={createArticle}
    />,
  );

const group = (heading: string) => {
  const rows = screen
    .getByRole("columnheader", { name: heading })
    .closest("tbody");
  if (!rows) throw new Error(`no group headed ${heading}`);
  return within(rows)
    .getAllByRole("link")
    .map((link) => link.textContent);
};

const field = (name: string) => screen.getByRole("textbox", { name });

it("groups Articles into Drafts newest first, Scheduled soonest first and Published newest first", () => {
  index([
    article({ id: 2, slug: "older-draft", title: "Older Draft" }),
    article({
      id: 3,
      slug: "later",
      title: "Later",
      publishAt: new Date(now.getTime() + 2 * DAY_MS),
    }),
    article({
      id: 4,
      slug: "older",
      title: "Older",
      publishAt: new Date(now.getTime() - 2 * DAY_MS),
    }),
    article({ id: 9, slug: "newer-draft", title: "Newer Draft" }),
    article({
      id: 5,
      slug: "sooner",
      title: "Sooner",
      publishAt: new Date(now.getTime() + DAY_MS),
    }),
    article({
      id: 6,
      slug: "newest",
      title: "Newest",
      publishAt: new Date(now.getTime() - DAY_MS),
    }),
  ]);

  expect(group("Drafts")).toEqual(["Newer Draft", "Older Draft"]);
  expect(group("Scheduled")).toEqual(["Sooner", "Later"]);
  expect(group("Published")).toEqual(["Newest", "Older"]);
});

it("gives a row the Article's Tagline, Publish date and Topics, linking to its writing room", () => {
  index([
    article({
      id: 7,
      title: "Type-safe SQL",
      tagline: "Where the types stop and the database begins.",
      publishAt: new Date("2026-09-14T03:00:00Z"),
      topics: ["TypeScript", "Postgres"],
    }),
  ]);

  const row = screen.getByRole("link", { name: "Type-safe SQL" });
  expect(row).toHaveAttribute("href", "/blog/write/7");
  const cells = row.closest("tr");
  expect(cells).toHaveTextContent(
    "Where the types stop and the database begins.",
  );
  expect(cells).toHaveTextContent("14 September 2026");
  expect(cells).toHaveTextContent("Postgres, TypeScript");
});

it("follows the title in the slug field until the owner edits the slug", async () => {
  const owner = userEvent.setup();
  index([]);

  await owner.type(field("Title"), "Type-safe SQL!");
  expect(field("Slug")).toHaveValue("type-safe-sql");

  await owner.clear(field("Slug"));
  await owner.type(field("Slug"), "sql");
  await owner.type(field("Title"), " again");
  expect(field("Slug")).toHaveValue("sql");
});

it("opens the new Draft's writing room once it is created", async () => {
  const owner = userEvent.setup();
  const createArticle = vi.fn(async () => ({ ok: true as const, id: 12 }));
  index([], createArticle);

  await owner.type(field("Title"), "Type-safe SQL");
  await owner.type(field("Tagline"), "Where the types stop.");
  await owner.click(screen.getByRole("button", { name: "Create Draft" }));

  expect(createArticle).toHaveBeenCalledWith({
    data: {
      title: "Type-safe SQL",
      slug: "type-safe-sql",
      tagline: "Where the types stop.",
      body: "",
      publishAt: null,
    },
  });
  expect(navigate).toHaveBeenCalledWith({
    to: "/blog/write/$id",
    params: { id: "12" },
  });
});

it("reports a taken slug on the slug field and keeps the form's values", async () => {
  const owner = userEvent.setup();
  index([], async () => ({ ok: false, reason: "slugTaken" }));

  await owner.type(field("Title"), "Kitchen sink");
  await owner.type(field("Tagline"), "Everything at once.");
  await owner.click(screen.getByRole("button", { name: "Create Draft" }));

  expect(field("Slug")).toHaveAccessibleDescription(
    "Another Article already has this slug.",
  );
  expect(field("Slug")).toBeInvalid();
  expect(field("Title")).toHaveValue("Kitchen sink");
  expect(field("Slug")).toHaveValue("kitchen-sink");
  expect(field("Tagline")).toHaveValue("Everything at once.");
  expect(navigate).not.toHaveBeenCalled();
});

it("names the database in red when it is not Local", () => {
  render(
    <ArticleIndex
      articles={[]}
      database={{ host: "ep-cold-recipe.neon.tech", isLocal: false }}
      now={now}
      createArticle={async () => ({ ok: true, id: 12 })}
    />,
  );

  const label = screen.getByText("Production");
  expect(label).toHaveAttribute("title", "ep-cold-recipe.neon.tech");
  expect(label).toHaveClass("text-name");
});
