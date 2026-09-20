import { readFileSync } from "node:fs";

// Plain Markdown read off disk, so the seed under bun and the tests under
// vitest share the one file. Nothing ships it to a browser.
export const kitchenSinkMarkdown = readFileSync(
  new URL("./kitchen-sink.md", import.meta.url),
  "utf8",
);
