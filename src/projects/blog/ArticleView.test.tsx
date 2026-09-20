import { render, screen, waitFor, within } from "@testing-library/react";
import { act, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ArticleView } from "./ArticleView";
import type { Article } from "./blog.server";
// The seed reads the same file off disk; under jsdom `import.meta.url` is not
// a file URL, so this test takes it through Vite instead.
import kitchenSinkMarkdown from "./kitchen-sink.md?raw";
import {
  ArticleSurfaceContext,
  type MermaidLoader,
  MermaidLoaderContext,
} from "./Mermaid";

vi.mock("@tanstack/react-router", () => import("@/test/router-stub"));

// The two browser seams the diagram component reaches for, neither of which
// jsdom implements.
Object.defineProperty(document, "fonts", {
  value: { load: () => Promise.resolve([]) },
});
Object.defineProperty(window, "matchMedia", {
  value: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
});

const article = (body: string): Article => ({
  slug: "an-article",
  title: "An Article",
  tagline: "One line about it.",
  body,
  publishAt: new Date("2026-09-14T03:00:00Z"),
  topics: ["Markdown"],
});

it("leaves the date out of the meta line of an Article with no Publish date", () => {
  render(
    <ArticleView
      article={{ ...article("Half a paragraph.\n"), publishAt: null }}
    />,
  );

  expect(screen.getByText("Markdown")).toBeVisible();
  expect(screen.queryByText(/September/)).toBeNull();
});

it("links a footnote reference to its footnote and back", () => {
  render(
    <ArticleView article={article("A claim.[^1]\n\n[^1]: The proof.\n")} />,
  );

  const reference = screen.getByRole("link", { name: "1" });
  const footnote = screen.getByRole("listitem");
  expect(reference).toHaveAttribute("href", `#${footnote.id}`);
  expect(footnote).toHaveTextContent("The proof.");
  expect(within(footnote).getByRole("link")).toHaveAttribute(
    "href",
    `#${reference.id}`,
  );
});

it("gives a heading an id and a # link to it", () => {
  render(<ArticleView article={article("## A section heading\n")} />);

  expect(
    screen.getByRole("heading", { level: 2, name: /A section heading/ }),
  ).toHaveAttribute("id", "a-section-heading");
  expect(
    screen.getByRole("link", { name: "Link to this heading" }),
  ).toHaveAttribute("href", "#a-section-heading");
});

it("colours a code fence in an imported language", () => {
  render(
    <ArticleView article={article('```ts\nconst ink = "green";\n```\n')} />,
  );

  expect(screen.getByText("const")).toHaveStyle({
    color: "var(--code-token-keyword)",
  });
});

it("leaves a code fence in an unimported language unhighlighted", () => {
  render(
    <ArticleView
      article={article('```haskell\nmain = putStrLn "hi"\n```\n')}
    />,
  );

  expect(screen.getByText('main = putStrLn "hi"')).toHaveStyle({
    color: "var(--code-foreground)",
  });
});

it("renders a callout directive with a label from its kind", () => {
  render(
    <ArticleView
      article={article(':::callout{kind="warning"}\nMind the **step**.\n:::\n')}
    />,
  );

  const callout = screen.getByRole("complementary");
  expect(within(callout).getByText("warning")).toBeVisible();
  expect(callout).toHaveTextContent("Mind the step.");
});

it("keeps prose that looks like a text directive as written", () => {
  render(<ArticleView article={article("Doors at 10:30, in a:b.\n")} />);

  expect(screen.getByText("Doors at 10:30, in a:b.")).toBeVisible();
});

it("keeps an unregistered directive as its source text", () => {
  render(
    <ArticleView article={article(":::unknown{kind=1}\nInside.\n:::\n")} />,
  );

  expect(screen.getByText(":::unknown{kind=1} Inside. :::")).toBeVisible();
});

it("shows raw HTML as text", () => {
  const { container } = render(
    <ArticleView article={article('<script>alert("hello")</script>\n')} />,
  );

  expect(screen.getByText('<script>alert("hello")</script>')).toBeVisible();
  expect(container.querySelector("script")).toBeNull();
});

const diagram = article(
  "```mermaid\nflowchart LR\n  Draft --> Published\n```\n",
);

const withLoader = (loadMermaid: MermaidLoader, children: ReactNode) => (
  <MermaidLoaderContext value={loadMermaid}>{children}</MermaidLoaderContext>
);

const neverLoads: MermaidLoader = () => new Promise(() => {});

it("stamps every top-level block with the source lines it was written on", () => {
  const { container } = render(
    withLoader(
      neverLoads,
      <ArticleView
        article={article(
          'A paragraph.\n\n```ts\nconst ink = "green";\n```\n\n:::callout{kind="warning"}\nMind the step.\n:::\n\n```mermaid\nflowchart LR\n  Draft --> Published\n```\n',
        )}
      />,
    ),
  );

  const blocks = [...container.querySelectorAll("[data-source-start]")];
  expect(
    blocks.map((block) => [
      block.tagName,
      block.getAttribute("data-source-start"),
      block.getAttribute("data-source-end"),
    ]),
  ).toEqual([
    ["P", "1", "1"],
    ["PRE", "3", "5"],
    ["ASIDE", "7", "9"],
    ["PRE", "11", "14"],
  ]);
});

it("shows a diagram's source as one code block while mermaid loads", () => {
  const { container } = render(
    withLoader(neverLoads, <ArticleView article={diagram} />),
  );

  expect(screen.getByText(/flowchart LR/)).toBeVisible();
  expect(container.querySelectorAll("pre")).toHaveLength(1);
});

it("keeps a diagram's source when mermaid cannot be loaded", async () => {
  const loadMermaid = () => Promise.reject(new Error("mermaid is not here"));

  render(withLoader(loadMermaid, <ArticleView article={diagram} />));

  expect(await screen.findByText("mermaid is not here")).toBeVisible();
  expect(screen.getByText(/flowchart LR/)).toBeVisible();
});

it("keeps a diagram's source when it does not draw", async () => {
  const loadMermaid = async () => ({
    initialize: () => {},
    render: () => Promise.reject(new Error("Parse error on line 2")),
  });

  render(withLoader(loadMermaid, <ArticleView article={diagram} />));

  expect(await screen.findByText("Parse error on line 2")).toBeVisible();
  expect(screen.getByText(/flowchart LR/)).toBeVisible();
});

it("swaps a diagram's source for the drawing mermaid returns", async () => {
  const loadMermaid = async () => ({
    initialize: () => {},
    render: async () => ({
      svg: '<svg role="img" aria-label="Draft to Published"></svg>',
    }),
  });

  render(withLoader(loadMermaid, <ArticleView article={diagram} />));

  expect(
    await screen.findByRole("img", { name: "Draft to Published" }),
  ).toBeVisible();
  expect(screen.queryByText(/flowchart LR/)).toBeNull();
});

const brokenDiagram = article("```mermaid\nflowchart LR\n  Draft -->\n```\n");

// mermaid as the owner mid-edit finds it: the diagram as first written draws,
// what the edit left of it does not.
const drawsAsFirstWritten: MermaidLoader = async () => ({
  initialize: () => {},
  render: async (_diagramId: string, source: string) => {
    if (!source.includes("Published")) throw new Error("Parse error on line 2");
    return { svg: '<svg role="img" aria-label="Draft to Published"></svg>' };
  },
});

it("keeps the last good drawing, dimmed, while a diagram's source is mid-edit", async () => {
  const room = (body: Article) => (
    <ArticleSurfaceContext value="editor">
      {withLoader(drawsAsFirstWritten, <ArticleView article={body} />)}
    </ArticleSurfaceContext>
  );
  const { container, rerender } = render(room(diagram));
  expect(
    await screen.findByRole("img", { name: "Draft to Published" }),
  ).toBeVisible();

  rerender(room(brokenDiagram));
  await act(async () => {});

  const drawing = container.querySelector(".mermaid-diagram");
  expect(drawing).toHaveClass("is-stale");
  expect(drawing).toContainElement(
    screen.getByRole("img", { name: "Draft to Published" }),
  );
  expect(container.querySelector("pre")).toBeNull();
});

it("draws under an id of its own each time, which mermaid is free to clear out", async () => {
  const drawnUnder: string[] = [];
  const loadMermaid: MermaidLoader = async () => ({
    initialize: () => {},
    render: async (diagramId: string) => {
      drawnUnder.push(diagramId);
      return { svg: `<svg role="img" aria-label="${diagramId}"></svg>` };
    },
  });
  const page = (body: Article) =>
    withLoader(loadMermaid, <ArticleView article={body} />);
  const { rerender } = render(page(diagram));
  await screen.findByRole("img");

  rerender(page(brokenDiagram));

  await waitFor(() => expect(drawnUnder).toHaveLength(2));
  expect(new Set(drawnUnder).size).toBe(2);
});

it("gives a reader the source and the message of a diagram that stops drawing", async () => {
  const page = (body: Article) =>
    withLoader(drawsAsFirstWritten, <ArticleView article={body} />);
  const { rerender } = render(page(diagram));
  await screen.findByRole("img", { name: "Draft to Published" });

  rerender(page(brokenDiagram));

  expect(await screen.findByText("Parse error on line 2")).toBeVisible();
  expect(screen.getByText(/Draft -->/)).toBeVisible();
});

it("hydrates the kitchen-sink Article with nothing logged to the console", async () => {
  const view = withLoader(
    neverLoads,
    <ArticleView article={article(kitchenSinkMarkdown)} />,
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(view);
  document.body.append(container);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  await act(async () => {
    hydrateRoot(container, view);
  });

  expect(consoleError.mock.calls).toEqual([]);
  consoleError.mockRestore();
});
