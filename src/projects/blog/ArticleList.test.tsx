import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ArticleList } from "./ArticleList";

it("gives a row the Article's title, Tagline, Publish date and Topics in alphabetical order", () => {
  render(
    <ArticleList
      articles={[
        {
          slug: "type-safe-sql",
          title: "Type-safe SQL",
          tagline: "Where the types stop and the database begins.",
          publishAt: new Date("2026-09-14T03:00:00Z"),
          topics: ["TypeScript", "Postgres"],
        },
      ]}
    />,
  );

  const row = screen.getByRole("listitem");
  expect(
    within(row).getByRole("link", { name: "Type-safe SQL" }),
  ).toHaveAttribute("href", "/blog/type-safe-sql");
  expect(row).toHaveTextContent(
    "Where the types stop and the database begins.",
  );
  expect(row).toHaveTextContent("14 September 2026 · Postgres, TypeScript");
});
