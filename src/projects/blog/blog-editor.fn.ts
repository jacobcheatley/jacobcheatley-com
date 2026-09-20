import { createServerFn } from "@tanstack/react-start";
import { articleSaveSchema } from "./article-schema";
import {
  createArticle,
  editorDatabase,
  listAllArticles,
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

export const createArticleFn = createServerFn({ method: "POST" })
  .validator(articleSaveSchema)
  .handler(({ data }) => {
    // The second layer under the route exclusion: were this endpoint ever to
    // reach production, this is all the build leaves of it.
    if (!import.meta.env.DEV) throw new Error("the Blog editor is local only");
    return createArticle(data);
  });
