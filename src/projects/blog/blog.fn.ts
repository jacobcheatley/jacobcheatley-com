import { createServerFn } from "@tanstack/react-start";
import { listPublishedArticles } from "./blog.server";

// Thin wrapper over the helper, which carries the tests: the handler is the
// only place that reads the clock, so the visibility rule stays testable.
export const listPublishedArticlesFn = createServerFn({
  method: "GET",
}).handler(() => listPublishedArticles(new Date()));
