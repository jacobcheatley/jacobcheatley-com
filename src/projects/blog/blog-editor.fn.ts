import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { articleDraftSchema, articleSaveSchema } from "./article-schema";
import {
  createArticle,
  deleteArticle,
  editorDatabase,
  findArticleForEditing,
  listAllArticles,
  listTopics,
  saveArticle,
} from "./blog-editor.server";

// The editor's endpoints, in a file nothing public imports: server functions
// register per compiled file, so a write beside a public read would ship as a
// live endpoint even with the editor's routes out of the build.

// The handler is the only place that reads the clock, so the index groups
// Articles against the same instant the server sent them at.
export const editorIndexFn = createServerFn({ method: "GET" }).handler(
  async () => ({
    articles: await listAllArticles(),
    database: editorDatabase(),
    now: new Date(),
  }),
);

// Everything the writing room opens with: the Article, every Topic its
// toggles offer, and the label that says which Blog this session is writing to.
export const writingRoomFn = createServerFn({ method: "GET" })
  .validator(z.int())
  .handler(async ({ data }) => ({
    article: await findArticleForEditing(data),
    allTopics: await listTopics(),
    database: editorDatabase(),
  }));

export const saveArticleFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.int(), save: articleSaveSchema }))
  .handler(({ data }) => {
    if (!import.meta.env.DEV) throw new Error("the Blog editor is local only");
    return saveArticle(data.id, data.save);
  });

export const deleteArticleFn = createServerFn({ method: "POST" })
  .validator(z.int())
  .handler(({ data }) => {
    if (!import.meta.env.DEV) throw new Error("the Blog editor is local only");
    return deleteArticle(data);
  });

export const createArticleFn = createServerFn({ method: "POST" })
  .validator(articleDraftSchema)
  .handler(({ data }) => {
    // The second layer under the route exclusion: were this endpoint ever to
    // reach production, this is all the build leaves of it.
    if (!import.meta.env.DEV) throw new Error("the Blog editor is local only");
    return createArticle(data);
  });
