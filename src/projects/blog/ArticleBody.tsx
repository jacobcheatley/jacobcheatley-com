import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import Markdown, { type Options } from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { createCssVariablesTheme, createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import python from "shiki/langs/python.mjs";
import typescript from "shiki/langs/typescript.mjs";
import { remarkArticleComponents } from "./article-components";
import { Callout } from "./Callout";

const paletteThemeName = "palette";

// Tokens come out as `var(--code-*)` references, which src/styles.css maps onto
// the site palette, so light and dark need no second theme and no JavaScript.
const paletteTheme = createCssVariablesTheme({
  name: paletteThemeName,
  variablePrefix: "--code-",
});

// A fence in any language not listed here falls back to plain text, so adding
// a language is one import and one entry.
const highlighter = createHighlighterCoreSync({
  themes: [paletteTheme],
  langs: [typescript, python],
  engine: createJavaScriptRegexEngine(),
});

// The directive registry: an Article reaches the components named here and no
// others, its attributes arriving as string props, and adding one is one entry.
const directiveComponents = {
  "directive-callout": Callout,
} satisfies Options["components"];

// The Blog's whole Markdown pipeline. It is synchronous, so the one component
// serves the server render, hydration and the editor preview. There is no
// rehype-raw and no sanitiser, which is what makes raw HTML come out as text.
const remarkPlugins: Options["remarkPlugins"] = [
  remarkGfm,
  remarkDirective,
  [remarkArticleComponents, new Set(Object.keys(directiveComponents))],
];

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
      <Markdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={directiveComponents}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
