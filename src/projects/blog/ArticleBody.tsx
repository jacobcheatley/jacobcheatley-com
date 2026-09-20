import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import Markdown, { type Options } from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { createCssVariablesTheme, createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import python from "shiki/langs/python.mjs";
import typescript from "shiki/langs/typescript.mjs";

// Every fence in an Article is highlighted with a grammar listed here; a fence
// in any other language falls back to plain text. Adding a language is one
// import plus one entry.
const codeLanguages = [typescript, python];

const paletteThemeName = "palette";

// Tokens come out as `var(--code-*)` references, which src/styles.css maps onto
// the site palette, so light and dark need no second theme and no JavaScript.
const paletteTheme = createCssVariablesTheme({
  name: paletteThemeName,
  variablePrefix: "--code-",
});

// Sync, because the whole pipeline has to stay synchronous.
const highlighter = createHighlighterCoreSync({
  themes: [paletteTheme],
  langs: codeLanguages,
  engine: createJavaScriptRegexEngine(),
});

// The Blog's whole Markdown pipeline. It is synchronous, so the one component
// serves the server render, hydration and the editor preview. There is no
// rehype-raw and no sanitiser, which is what makes raw HTML come out as text.
const remarkPlugins: Options["remarkPlugins"] = [remarkGfm];

const rehypePlugins: Options["rehypePlugins"] = [
  rehypeSlug,
  [
    rehypeAutolinkHeadings,
    {
      behavior: "append",
      content: { type: "text", value: "#" },
      properties: { className: "anchor", ariaLabel: "Link to this heading" },
    },
  ],
  [
    rehypeShikiFromHighlighter,
    highlighter,
    { theme: paletteThemeName, fallbackLanguage: "text" },
  ],
];

export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="prose">
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {markdown}
      </Markdown>
    </div>
  );
}
