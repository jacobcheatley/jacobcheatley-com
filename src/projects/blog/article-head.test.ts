import { expect, it } from "vitest";
import { articleHead } from "./article-head";

it("fills the title, description and Open Graph tags from the Article's title and Tagline", () => {
  expect(
    articleHead({
      title: "Type-safe SQL",
      tagline: "Where the types stop and the database begins.",
    }),
  ).toEqual([
    { title: "Type-safe SQL" },
    {
      name: "description",
      content: "Where the types stop and the database begins.",
    },
    { property: "og:title", content: "Type-safe SQL" },
    {
      property: "og:description",
      content: "Where the types stop and the database begins.",
    },
  ]);
});
