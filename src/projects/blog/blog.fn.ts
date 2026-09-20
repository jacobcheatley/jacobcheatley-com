import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { findPublishedArticle, listPublishedArticles } from "./blog.server";

// Thin wrappers over the helpers, which carry the tests: the handlers are the
// only place that reads the clock, so the visibility rule stays testable.
export const listPublishedArticlesFn = createServerFn({
  method: "GET",
}).handler(() => listPublishedArticles(new Date()));

// Any string is a slug to look up. Nothing narrower: a slug of the wrong shape
// has no Article either, and the reader must not be able to tell those apart.
export const findPublishedArticleFn = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(({ data }) => findPublishedArticle(data, new Date()));
