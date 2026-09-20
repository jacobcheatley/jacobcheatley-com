# Which Markdown rendering pipeline fits the Blog?

Research for ticket 110 (map 109). Versions and maintenance checked on 2026-09-20 with
`npm view` and the GitHub API. Claims marked **[ran]** were proven by installing the
packages and running a script under Bun 1.4.2 with React 19.3.0 and TypeScript 7.0.2.

## Recommendation

**`react-markdown` on the unified (remark/rehype) pipeline, rendered synchronously, with
Shiki's CSS-variables theme for code and official `mermaid` loaded lazily in the browser
only.**

One `<ArticleBody source={markdown} />` component is the renderer. It is an ordinary
synchronous React component, so the same code runs in SSR (`renderToString` / TanStack
Start streaming), in hydration, and in the editor's live preview. No server-only step
exists, so the preview cannot drift from the published Article.

### Packages

| Package | Version | Role |
| --- | --- | --- |
| `react-markdown` | 10.1.0 | Markdown string to React elements; `components` prop is the component registry |
| `remark-gfm` | 4.0.1 | Footnotes, tables, strikethrough, task lists, autolinks |
| `remark-directive` | 4.0.0 | Parses `:text`, `::leaf`, `:::container` directives into syntax-tree nodes |
| `rehype-slug` | 6.0.0 | `id` on every heading |
| `rehype-autolink-headings` | 7.1.0 | Anchor link on every heading |
| `shiki` | 4.4.3 | Highlighter (fine-grained imports: `shiki/core`, `shiki/engine/javascript`, `shiki/langs/*`) |
| `@shikijs/rehype` | 4.4.3 | `@shikijs/rehype/core` is the synchronous rehype plugin taking a pre-built highlighter |
| `mermaid` | 12.0.0 | Diagrams, dynamically imported in the browser |
| `unist-util-visit` | 5.1.0 | Tree walker for the one custom plugin (already a transitive dependency; list it because we import it) |
| `@types/mdast` | 4.0.4 (dev) | Types for the Markdown syntax tree used by the custom plugin |

Not needed: `unified`, `remark-parse`, `remark-rehype`, `hast-util-to-jsx-runtime`
(react-markdown bundles exactly these), `rehype-raw`, `rehype-sanitize`, `rehype-mermaid`,
`rehype-pretty-code`.

Ecosystem orientation, for a Python reader: **unified** is a pipeline of small plugins
over syntax trees, like a chain of AST passes. **remark** plugins work on the Markdown
tree (mdast), **rehype** plugins on the HTML tree (hast). `react-markdown` runs
parse, remark plugins, conversion to hast, rehype plugins, then turns the final tree into
React elements with no HTML string or `dangerouslySetInnerHTML` in between.

## What was run

Sample input contained a heading, a footnote, a `ts` code fence, a `mermaid` fence,
`:::callout{kind="warning"}`, `::demo{name="x"}`, an unregistered `::unregistered{}`,
raw `<script>` / `<b onclick>`, a `javascript:` link, and the prose `10:30` and `a:b`.

```tsx
const highlighter = createHighlighterCoreSync({
  themes: [createCssVariablesTheme({ name: "site", variablePrefix: "--code-" })],
  langs: [typescript, python],            // from "shiki/langs/typescript.mjs" etc.
  engine: createJavaScriptRegexEngine(),  // from "shiki/engine/javascript"
});

const html = renderToString(
  <Markdown
    remarkPlugins={[remarkGfm, remarkDirective, remarkDirectivesToElements]}
    rehypePlugins={[
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: "wrap" }],
      [rehypeShikiFromHighlighter, highlighter, { theme: "site", fallbackLanguage: "text" }],
    ]}
    components={{
      "directive-callout": Callout,
      "directive-demo": Demo,
      "directive-mermaid": Mermaid,
    }}
  >
    {source}
  </Markdown>,
);
```

The one custom plugin (about 30 lines) does three things:

```ts
function remarkDirectivesToElements() {
  return (tree: Root, file: { value: unknown }) => {
    visit(tree, (node, index, parent) => {
      if (node.type === "code" && node.lang === "mermaid" && parent && index !== undefined) {
        parent.children[index] = {
          type: "leafDirective", name: "mermaid", children: [],
          data: { hName: "directive-mermaid", hProperties: { source: node.value } },
        };
        return;
      }
      if (node.type !== "containerDirective" && node.type !== "leafDirective"
        && node.type !== "textDirective") return;
      if (directiveNames.has(node.name)) {
        node.data = { hName: `directive-${node.name}`, hProperties: node.attributes ?? {} };
        return;
      }
      // unregistered: put the author's original characters back
      if (parent && index !== undefined && node.position) {
        const original = String(file.value).slice(
          node.position.start.offset, node.position.end.offset);
        parent.children[index] = node.type === "textDirective"
          ? { type: "text", value: original }
          : { type: "paragraph", children: [{ type: "text", value: original }] };
      }
    });
  };
}
```

Results **[ran]**:

- Heading: `<h1 id="hello-world"><a href="#hello-world">Hello world</a></h1>`.
- Footnote: GFM `<sup>` reference plus a `<section data-footnotes class="footnotes">` with
  back-references and an `sr-only` "Footnotes" heading (needs the `sr-only` class, which
  Tailwind already provides).
- Code: `<pre class="shiki site" style="background-color:var(--code-background);color:var(--code-foreground)">`
  with token spans such as `style="color:var(--code-token-keyword)"`. No colours in the
  HTML at all.
- Callout: `<aside data-callout="warning"><p>Careful <strong>now</strong>.</p></aside>`.
  Markdown inside a container directive is rendered and arrives as `children`.
- Leaf directive: `<div data-demo="x">`. Directive attributes arrive as string props.
- Raw HTML: escaped to visible text (`&lt;script&gt;alert(1)&lt;/script&gt;`).
- `[bad](javascript:alert(1))` rendered as `<a href="">`.
- Typechecks under `tsc --strict` with TypeScript 7.0.2 with no suppression, once the
  custom tag names are declared (see "Registry typing").

## How each launch extension is covered

### Highlighted code, themable from CSS variables

Shiki's `createCssVariablesTheme` emits `var(--prefix-token-*)` instead of colours. The
variables are foreground, background, and nine token roles: constant, string, comment,
keyword, parameter, function, string-expression, punctuation, link
([theme colors guide](https://shiki.style/guide/theme-colors)). The theme "is a lot less
granular than most of the other themes", is not deprecated, and must be registered
explicitly from `shiki/core`.

That coarseness suits this site. `src/styles.css` already defines the palette as
`light-dark()` tokens (`--color-ink`, `--color-accent`, `--color-accent-2`,
`--color-muted`, ...), so mapping the eleven `--code-*` variables onto those tokens in CSS
gives light and dark code blocks with zero JavaScript and no second theme.

**Dual themes lose here.** [Dual themes](https://shiki.style/guide/dual-themes) render
every token with two hard-coded colours from two published editor themes
(`--shiki-light` / `--shiki-dark`) and need CSS to switch them. The result follows
someone else's palette, not the site's, and doubles the inline style payload. Choose dual
themes only if nine token roles ever feels too flat.

Synchronous highlighting is what keeps a single renderer. `@shikijs/rehype` (the default
export) is an async plugin, which would force `MarkdownAsync` on the server and
`MarkdownHooks` on the client: two code paths, and `MarkdownHooks` renders nothing on
first paint ([react-markdown API](https://github.com/remarkjs/react-markdown#markdownhooks)).
`@shikijs/rehype/core` takes a highlighter built with `createHighlighterCoreSync`, which
requires the JavaScript regex engine and grammars imported as plain objects
([sync usage](https://shiki.style/guide/sync-usage)). The JS engine supports all built-in
languages since Shiki 3.9.1, needs ES2024 / the RegExp `v` flag, avoids the Oniguruma
WASM file, and is the documented choice for browsers
([regex engines](https://shiki.style/guide/regex-engines)).

Cost of this choice: the language list is explicit. A fence in a language that was not
imported falls back to plain text (`fallbackLanguage: "text"`); adding a language is one
import line.

Alternatives: `rehype-highlight` 7.0.2 / `lowlight` 3.3.0 (highlight.js) is synchronous
and class-based, so it is also themable from CSS, but highlight.js grammars are visibly
weaker on TypeScript than Shiki's TextMate grammars and the package was last published in
February 2025. `rehype-pretty-code` 0.14.5 is a Shiki wrapper adding line highlighting
and titles; it is async-only and still 0.x. Neither is needed.

### Mermaid: client-only, lazy-loaded

Official mermaid cannot render on the server without a browser:

- **[ran]** `mermaid.render()` under Bun throws `ReferenceError: document is not defined`.
- The 12.0.0 release notes state that "mermaid requires a browser"; the Node version
  floor exists only for dependencies
  ([releases](https://github.com/mermaid-js/mermaid/releases)).
- `rehype-mermaid` 3.0.0, the unified server-side option, depends on `mermaid-isomorphic`,
  whose peer dependency is `playwright`: it is a headless browser. That is a non-starter
  on a Bun server rendering database content at request time, and its mermaid range is
  still `^11`.

So the plugin above turns a ` ```mermaid ` fence into a `directive-mermaid` element
carrying the source, and the `Mermaid` component in the registry renders the source in a
`<pre>` during SSR and first paint, then in `useEffect` does `await import("mermaid")`
and swaps in the SVG. Articles without a diagram never download mermaid. The editor
preview uses the same component.

Things to know:

- Size: a single-file browser build of `mermaid` 12.0.0 is 5.2 MB minified, 1.5 MB gzip
  **[ran]**. That figure is a ceiling, because `Bun.build` without splitting inlines
  every diagram type; mermaid loads diagram types through dynamic `import()`, which Vite
  splits into per-diagram chunks. It is still by far the heaviest piece, which is why it
  must stay behind a dynamic import.
- Theming: only the `base` theme is customisable and "the theming engine will only
  recognize hex colors" ([theming](https://mermaid.js.org/config/theming.html)), so
  mermaid cannot consume `var(--color-ink)` or `light-dark()`. The component has to pass
  hex values and re-render when the colour scheme changes. This is a spec detail, not a
  blocker.
- 12.0.0 was published on 2026-09-10 and changes defaults (ELK layout, `redux-color`
  theme, `neo` look, ES2024 / Safari 17.4+). It is ten days old; 11.17.2 is the fallback
  if it misbehaves.

`beautiful-mermaid` 1.1.3 is the one real way to render on the server without a browser.
**[ran]** `renderMermaidSVG(source, { bg: "var(--paper)", fg: "var(--ink)" })` returns an
SVG string synchronously under Bun, and it accepts CSS variables directly. It lost
because: it is a reimplementation covering six diagram types, not mermaid itself; it
rejected the valid mermaid one-liner `graph TD; A-->B;` **[ran]**; every SVG carries an
unconditional `@import url('https://fonts.googleapis.com/...')` (`src/theme.ts`), a
third-party request on a site that self-hosts fonts; last npm publish 2026-02-26, last
push 2026-05-06, 86 open issues; and at 1.6 MB minified / 493 KB gzip **[ran]** it would
ship in the Article bundle for hydration. Revisit only if the no-JS fallback or the flash
before the diagram appears turns out to matter.

### Footnotes

`remark-gfm` 4.0.1. Nothing else. The `user-content-` id prefix is react-markdown's
default clobber protection and is harmless.

### Heading anchors

`rehype-slug` 6.0.0 plus `rehype-autolink-headings` 7.1.0. `behavior` picks between
wrapping the heading text, or prepending / appending a link icon. Both packages are
small, feature-complete unified-collective packages; their age (2023) reflects that they
are finished, not abandoned, and both have zero open issues.

### Callout

A container directive, not a GitHub-style `> [!NOTE]` blockquote. A callout is then just
the first entry in the directive registry and costs no extra package:

```markdown
:::callout{kind="warning"}
Careful **now**.
:::
```

### Directives mapped to a registry of React components

`remark-directive` only parses; its readme says to "create your own plugin" to handle the
nodes, and shows the `data.hName` / `data.hProperties` technique used above. The registry
is then the plain `components` object handed to react-markdown: tag name to component.
Article content stays inert data because a directive can only name a component that the
repo registered, and its attributes arrive as string props for the component to parse
(zod at that boundary, per the coding standards).

**Surprise: text directives eat ordinary prose.** **[ran]** With `remark-directive`
enabled and no handling, `at 10:30` rendered as `at 10<div></div>` and `a:b` lost its
`:b`, because `:30` and `:b` parse as text directives and unhandled directive nodes
become empty `<div>`s. The plugin above fixes this by restoring the original source
characters for any unregistered directive, which also makes a typo in a directive name
visible in the preview instead of silently vanishing. This needs a pinned test.

#### Registry typing

react-markdown's `Components` type is keyed on `JSX.IntrinsicElements`, so custom tag
names need declaring once. This is TypeScript "module augmentation": adding fields to a
library's interface from your own code. **[ran]** this typechecks with no
`@ts-expect-error`:

```ts
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "directive-callout": { kind?: string; children?: ReactNode };
      "directive-demo": { name?: string };
      "directive-mermaid": { source: string };
    }
  }
}
```

## Raw HTML in Markdown

Inert by default, with no sanitiser to configure. react-markdown never uses
`dangerouslySetInnerHTML`; without `rehype-raw`, HTML in the source is escaped to visible
text **[ran]**, and its default `urlTransform` blanks unsafe URL schemes **[ran]**. Its
readme: "Use of react-markdown is secure by default."

Do not add `rehype-raw` (the readme sizes it at about 60 KB min+gzip and it exists to
opt in to raw HTML). `rehype-sanitize` is only needed after `rehype-raw` or untrusted
plugins, so it is not needed either. Anything that would have been raw HTML becomes a
directive plus a registered component. This matches "content stays inert data" and means
a future live-site editor inherits a safe renderer.

## Server and browser

With TanStack Start SSR the Article route renders on the server and then hydrates, so the
renderer runs in both places even for readers, not only in the editor. Consequences:

- Rendering must be deterministic and synchronous on both sides. It is: the same plugins,
  the JS regex engine on both sides, no async plugin, no environment check.
- The Markdown stack ships to the browser on Article pages. Measured with
  `Bun.build({ minify: true, target: "browser" })`, React external **[ran]**:

| Bundle | Minified | Gzip |
| --- | --- | --- |
| react-markdown + remark-gfm + remark-directive + rehype-slug + rehype-autolink-headings | 215 KB | 65 KB |
| Shiki core + JS engine + rehype plugin + TypeScript and Python grammars | 419 KB | 82 KB |
| mermaid 12 (unsplit ceiling, lazy) | 5243 KB | 1508 KB |
| marked 18 | 44 KB | 13 KB |
| markdown-it 15 | 98 KB | 41 KB |
| markdown-to-jsx 9 | 77 KB | 28 KB |

About 150 KB gzip for the Article route, growing with each Shiki grammar. TanStack
Router's route-level code splitting keeps it off the Portfolio and other Projects.
Rendering to an HTML string on the server and injecting it would avoid that cost but
breaks both the component registry (nothing to hydrate) and the "preview is the real
renderer" decision, so it is rejected.

- Nothing is cached, so the open map question about a Scheduled Article's Publish date
  passing has no pipeline-side answer to worry about: rendering happens per request from
  the row.

## Candidates compared

| | Output | Directives to React | Raw HTML default | Maintenance (2026-09-20) |
| --- | --- | --- | --- | --- |
| **react-markdown 10.1.0** (unified) | React elements | `remark-directive` + `components` prop, first-class | Escaped; safe by default | Repo pushed 2026-09-01, 5 open issues; npm release 2025-03 |
| unified + `hast-util-to-jsx-runtime` 2.3.6 by hand | React elements | Same plugins | Same | Same collective |
| markdown-it 15.0.2 | HTML string | `markdown-it-directive` 2.0.6 (third party) renders to HTML, not components | `html: false` by default | Active (pushed 2026-09-12) |
| marked 18.0.13 | HTML string | `marked-directive` 1.0.7, last published 2024-09 | Passed through; "Marked does not sanitize the output HTML" | Active (pushed 2026-09-15) |
| micromark 4.0.2 | HTML string | It is the tokenizer inside remark; no tree to transform | Escaped unless `allowDangerousHtml` | Stable |
| markdown-to-jsx 9.10.3 | React elements | No directive syntax; its extension point is raw HTML/JSX tags in the Markdown mapped through `overrides` | Parses HTML into elements by design | Active, single maintainer |

**Runner-up: hand-rolled unified + `hast-util-to-jsx-runtime`.** It is the same engine
and the same plugins, and react-markdown is a thin wrapper over it, so it would work
identically. It lost because it means listing four more direct dependencies (`unified`,
`remark-parse`, `remark-rehype`, `hast-util-to-jsx-runtime`) and re-writing what
react-markdown already provides: the pipeline wiring, the `components` typing, and above
all the safe-by-default `urlTransform`. Its only advantage, parsing once and
reusing the tree (for a table of contents, say), is not a launch need.

The string-output parsers (marked, markdown-it, micromark) lost for a structural reason:
to reach a React component registry from an HTML string you add an HTML-to-React parser
(`html-react-parser` 6.1.8) and, for marked, a sanitiser (`dompurify` 3.4.15), which
rebuilds half of rehype with more trust placed in string handling. Their size advantage
disappears once those are added. `markdown-to-jsx` lost because its component mechanism
is raw HTML tags in the content, which is the MDX-shaped thing the map ruled out.

## Blogging frameworks: not relevant

content-collections 0.15.2 ("Your content is parsed and validated during the build
process"), Velite 0.4.0 ("Turns Markdown / MDX, YAML, JSON, or others into app's data
layer") and Fumadocs 16 ("React.js docs framework") all solve the same problem: turning
**files in the repo** into typed data **at build time**, usually compiled through MDX.
Articles here are database rows written at runtime through the editor and published
without a release, so there is no build step for these tools to hook into, and their
value (file watching, frontmatter schemas, typed imports) has nothing to act on. Drizzle
and zod already are the typed data layer. Both content-collections and Velite are also
still 0.x.

## Maintenance notes

The unified packages look old by publish date (`remark-directive` 2025-02,
`rehype-slug` 2023-11). They are small, finished, ESM-only packages from one collective
with near-zero open issues, and the react-markdown repo was pushed this month. Nothing in
the recommended set is deprecated. The fast-moving parts are Shiki (4.4.3, 2026-08-10)
and mermaid (12.0.0, 2026-09-10), both very active.

## What the spec should pin with tests

- Each extension's output contract through `renderToString(<ArticleBody />)`: heading id
  and anchor, footnote section, code block uses `var(--code-*)` and no literal colour,
  mermaid fence becomes the Mermaid component with its source, callout renders its inner
  Markdown.
- Unregistered directives and prose colons (`10:30`, `a:b`) come out as the original
  text.
- Raw `<script>` comes out escaped; `javascript:` links come out inert.
- A fence in an unimported language renders as plain text rather than throwing.
