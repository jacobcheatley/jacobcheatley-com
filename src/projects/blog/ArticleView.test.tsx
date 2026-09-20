import { render, screen, within } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ArticleView } from "./ArticleView";
import type { Article } from "./blog.server";
// The seed reads the same file off disk; under jsdom `import.meta.url` is not
// a file URL, so this test takes it through Vite instead.
import kitchenSinkMarkdown from "./kitchen-sink.md?raw";

vi.mock("@tanstack/react-router", () => import("@/test/router-stub"));

const article = (body: string): Article => ({
  slug: "an-article",
  title: "An Article",
  tagline: "One line about it.",
  body,
  publishAt: new Date("2026-09-14T03:00:00Z"),
  topics: ["Markdown"],
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

it("hydrates the kitchen-sink Article with nothing logged to the console", async () => {
  const view = <ArticleView article={article(kitchenSinkMarkdown)} />;
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
