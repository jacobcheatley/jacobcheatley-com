# Blog editor: which component for the source pane?

Research for the Blog wayfinder map. Versions, dates and repository status were read
from the npm registry and the GitHub API on 2026-09-20. Claims marked **(ran it)** come
from a throwaway script run under Bun 1.4.2 outside the repo; nothing from it is
committed.

## Recommendation

**CodeMirror 6, used directly (no React wrapper), mounted in a `useEffect`.**

| Package | Version | Why |
| --- | --- | --- |
| `codemirror` | 6.0.2 | Meta-package: `EditorView`, `basicSetup`, `minimalSetup` |
| `@codemirror/lang-markdown` | 6.5.2 | Markdown grammar, colouring, list/quote continuation on Enter |
| `@codemirror/language-data` | 6.5.2 | 143 lazily loaded grammars for the code inside fences |
| `@codemirror/view` | 6.43.12 | Direct import of `keymap`, only needed to bind Tab |
| `@codemirror/commands` | 6.11.1 | Direct import of `indentWithTab`, only needed to bind Tab |
| `@replit/codemirror-vim` | 6.4.0 | **Optional.** Add only if the owner actually edits in vim |

`@codemirror/view` and `@codemirror/commands` are already installed transitively by
`codemirror`; listing them is only so the import is of a declared dependency. Total
footprint installed **(ran it)**: 54 packages, 13 MB in `node_modules`, all MIT. Every
`@codemirror/*` and `@lezer/*` package is by one author (Marijn Haverbeke).

Runner-up: a plain `<textarea>`. It lost on four concrete things listed under
[What a textarea cannot do](#what-a-textarea-cannot-do), not on polish.

## The context that shapes the answer

- The editor is single-user and exists only under `bun run dev`. Bundle size is
  irrelevant; install size and number of moving parts still count.
- Source plus live preview, not WYSIWYG. The preview is the site's own Article renderer,
  so a packaged editor is only worth anything for its source pane.
- Articles will be code-heavy: fenced blocks in several languages, mermaid, directives.

## What a textarea cannot do

These are the ones that hurt on a code-heavy Article. Each is a platform limit, not
something a little code fixes cleanly.

1. **No colouring at all.** A `<textarea>` renders one style of text; ranges cannot be
   styled. Fence boundaries, the language of a fence, and the code inside it all look
   like prose. The usual workaround (a transparent textarea over a highlighted `<pre>`,
   which is what `@uiw/react-md-editor` and `react-simple-code-editor` do) is more code
   and more fragile than a real editor.
2. **Tab and programmatic edits fight the undo stack.** Tab moves focus out of a
   textarea, so indenting needs a `keydown` handler that inserts text. Writing the text
   from script (`.value`, `setRangeText()`) bypasses the browser's undo history. The
   only way to insert text and keep undo is `document.execCommand("insertText")`, which
   MDN marks deprecated while conceding exactly this gap: "unlike direct DOM
   manipulation, modifications performed by `execCommand()` preserve the undo buffer"
   ([MDN: execCommand](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand)).
   This project avoids deprecated APIs, so the honest textarea either breaks undo on every
   Tab / auto-indent / list continuation, or does none of them.
3. **No indentation help inside fences.** Enter returns to column 0. Pasting or writing
   nested Python or TypeScript means hand-typing every indent, and Shift-Tab to dedent a
   selected block does not exist.
4. **No line-accurate scroll sync when lines wrap.** A textarea exposes `scrollTop` but
   no way to ask which source line is at a pixel offset once soft wrapping is on. That
   leaves proportional sync (`scrollTop / scrollHeight`), which drifts badly exactly
   when the Article is code-heavy: a 40-line mermaid fence renders as one diagram, a
   one-line image renders tall.
5. **No vim keys.** Not available for a textarea from inside the page.

What a textarea does well, stated fairly: zero dependencies, SSR-safe by construction,
native spellcheck, native undo while you only type, browser find works in it, and it is
trivially testable with Testing Library in jsdom. For a prose-only blog it would be the
right answer. If the owner would rather start there, the seam is the same either way
(`initialMarkdown` in, `onChange(markdown)` out), so swapping later costs one component.

## CodeMirror 6

### Status

- Actively released: `@codemirror/view` 6.43.12, `@codemirror/state` 6.7.5 and
  `@codemirror/commands` 6.11.1 were all published 2026-09-15; `@codemirror/lang-markdown`
  6.5.2 on 2026-08-04; `@lezer/markdown` 1.7.2 on 2026-07-15
  ([npm registry](https://registry.npmjs.org/@codemirror/view)).
- **Surprise:** `github.com/codemirror/dev` is archived. Its README reads "This
  repository has moved to https://code.haverbeke.berlin/codemirror/dev", and the npm
  `repository` field of `@codemirror/view` points at that self-hosted forge. The project
  is alive; its source and issue tracker just left GitHub. (codemirror.net did not
  respond from the research sandbox, so API quotes below come from the type declarations
  shipped in the npm packages, which is what the website reference is generated from.)
- The `codemirror` meta-package has sat at 6.0.2 since 2025-06-19. That is normal: it is
  an array of imports with `^6.0.0` ranges, so installs pick up current sub-packages.
- No React involvement, so nothing to be React 19 compatible with.

### Markdown and nested fence languages

`markdown()` options, from the
[lang-markdown README](https://github.com/codemirror/lang-markdown/blob/main/README.md):

- `base`: "The base language to use. Defaults to commonmarkLanguage." `markdownLanguage`
  is "GFM plus subscript, superscript, and emoji syntax".
- `codeLanguages`: "A source of language support for highlighting fenced code blocks.
  When it is an array, the parser will use LanguageDescription.matchLanguageName with the
  fenced code info to find a matching language."
- `markdownKeymap` (installed unless `addKeymap: false`): "Binds Enter to
  insertNewlineContinueMarkup and Backspace to deleteMarkupBackward", which continues
  and unwinds list and blockquote markers.

Passing `languages` from `@codemirror/language-data` as `codeLanguages` gives lazy,
per-language loading: each grammar is a dynamic `import()` fetched the first time a fence
names it. **(ran it)** With the grammars loaded, the cursor inside a ```` ```python ````
fence resolves to `FunctionDefinition` / `ReturnStatement` nodes and inside ```` ```ts ````
to `VariableDeclaration` / `TypeAnnotation`, so the fence body really is parsed by the
nested language. `mermaid` has no grammar in language-data; its fence body stays plain
`CodeText`, which is harmless. Directive syntax (`:::callout`) is likewise uncoloured
unless a small `@lezer/markdown` extension is written; not needed for launch.

### Indentation inside fences

**(ran it)** `getIndentation()` on a blank line inside a ```` ```ts ```` fence after
`function f() {` returns 2 (language-aware). Inside a ```` ```python ```` fence after
`def f(x):` it returns `null`, as it does for an unknown language or a nested list item.
`null` is not "column 0": `insertNewlineAndIndent` falls back to the previous line's
leading whitespace (`@codemirror/commands` source, `if (indent == null) indent =
countColumn(/^\s*/.exec(...))`). So: brace languages auto-indent, everything else keeps
the current indent, and both beat a textarea.

Tab is deliberately unbound by default so keyboard users are not trapped.
`indentWithTab` is "A binding that binds Tab to indentMore and Shift-Tab to indentLess.
Please see the Tab example before using this." The default keymap keeps an escape hatch:
"Ctrl-m (Alt-Shift-m on macOS): toggleTabFocusMode". For a single-user editor, binding
Tab is fine. Set the unit with `indentUnit.of("  ")`.

### Vim

[`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim) 6.4.0, published
2026-07-29, repo pushed the same day, not archived, 37 open issues. It was recently
restructured into a pnpm workspace with an editor-agnostic
`@replit/codemirror-vim-core` (0.1.x) that the main package depends on. Peer
dependencies are `@codemirror/{commands,language,search,state,view}` at `6.x.x`, all
satisfied by `codemirror`. Usage, from its README:

```js
extensions: [
  // make sure vim is included before other keymaps
  vim(),
  basicSetup,
]
```

"if you are not using `basicSetup`, make sure you include the drawSelection plugin".
Ex commands are one call: `Vim.defineEx('write', 'w', save)` gives `:w` to save the
Article. It is the CodeMirror 5 vim mode ported, so coverage is broad but it is an
emulation, not Neovim. Whether to install it is the owner's call; it is one package and
one line, and "config nobody sets" applies if the owner does not use vim.

### Wrapper or direct?

`@uiw/react-codemirror` 4.25.11 (2026-07-08, 2.2k stars, 172 open issues, peer
`react >=17`). It brings `@babel/runtime`, a required `@codemirror/theme-one-dark` peer,
and its own fork of basic-setup. What it buys is a controlled `value` prop that
reconciles outside changes into the editor.

This editor does not need that. The Article is loaded once, the editor owns the text
while it is open, and changes flow one way out. Direct use is about twenty lines:

```tsx
function SourcePane({ initialMarkdown, onChange }: SourcePaneProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = new EditorView({
      doc: initialMarkdown,
      parent: parentRef.current ?? undefined,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    });
    return () => view.destroy();
  }, []);
  return <div ref={parentRef} />;
}
```

(An "extension" is CodeMirror's unit of configuration: a value you put in the array.
There are no plugins to register or options object to learn beyond that.) The cleanup
`destroy()` also makes React 19 StrictMode's double mount in dev harmless.

One trap the wrapper does not save you from either: two copies of `@codemirror/state` in
`node_modules` break extension identity checks ("Unrecognized extension value"). Keep
every `@codemirror/*` on the single 6.x line and let Bun dedupe.

### SSR under TanStack Start

**(ran it)** Importing `codemirror`, `@codemirror/lang-markdown`,
`@codemirror/language-data` and `@replit/codemirror-vim` with no DOM (`typeof document
=== "undefined"`) succeeds, and `EditorState.create()` works. Only `new EditorView()`
throws `ReferenceError: document is not defined`. Because construction sits in
`useEffect`, which never runs on the server, the component above server-renders as an
empty `<div>` and hydrates without a mismatch. No lazy import or guard is required.

If the editor route should skip SSR anyway, the installed versions offer both tools:
`ClientOnly` (with a `fallback`) and `useHydrated` exported from
`@tanstack/react-router` 1.170.35, and the per-route `ssr` option typed
`boolean | 'data-only'` in `@tanstack/router-core`.

### Scroll sync with the preview

The editor side has exact APIs (quoted from `@codemirror/view` 6.43.12 types):

- `scrollDOM`: "The DOM element that can be styled to scroll."
- `lineBlockAtHeight(height)`: "Find the line block ... at the given height, again
  interpreted relative to the top of the document." The returned `BlockInfo.from` is a
  document offset; `state.doc.lineAt(from).number` is the source line. Correct with
  wrapping on.
- `lineBlockAt(pos)` and `EditorView.scrollIntoView(pos, { y: "start" })` for the
  reverse direction.

The preview side needs the Article renderer to stamp block elements with their source
line in the editor only (mdast/hast nodes carry `position.start.line` if the pipeline is
unified-based; that is the rendering-pipeline ticket's business). Sync is then: on
editor scroll, read the top source line, find the last preview element whose line is at
or before it, scroll the preview to it. One direction is enough for an author who types
on the left. Guard against feedback loops only if both directions are built.

### Costs

- Around 50 transitive packages from a single maintainer, now hosted off GitHub.
- The content is a `contenteditable`, not a form control. Native spellcheck is off by
  default; `EditorView.contentAttributes.of({ spellcheck: "true" })` turns it on.
- Not verified here: driving CodeMirror through Testing Library in jsdom is known to be
  awkward because it depends on layout measurement. Test the editing page through the
  `onChange` seam and leave typing to Playwright in CI.

## Monaco

- `monaco-editor` 0.56.0 (2026-07-20), maintained by Microsoft, 98 MB unpacked.
- `@monaco-editor/react` 4.7.0 is from 2025-02-13 with a `4.8.0-rc.3` on the `next` tag;
  peers allow React 19. By default it downloads Monaco from a CDN at runtime. Bundling
  from npm under Vite needs a `self.MonacoEnvironment.getWorker` block importing five
  `?worker` modules
  ([monaco-react README](https://github.com/suren-atoyan/monaco-react#loader-config)).
- Its Monarch Markdown tokenizer does embed fence languages
  (`{ token: 'string', next: '@codeblockgh', nextEmbedded: '$1' }` in
  [markdown.ts](https://github.com/microsoft/monaco-editor/blob/main/src/basic-languages/markdown/markdown.ts)),
  so colouring is comparable.
- Vim is third-party: `monaco-vim` 0.4.4 (2025-11-22, repo active, 361 stars), itself a
  port of the same CodeMirror 5 vim code.
- It touches `document`, so it must be client-only.

Monaco is an IDE core (language services, workers, minimap). Nothing it adds over
CodeMirror matters for Markdown, and it costs worker configuration, a wrapper whose
stable release is nineteen months old, and a seven-times-larger install. Rejected.

## Packaged source-plus-preview React editors

All of these ship their own Markdown renderer and toolbar, which this project would
switch off. Judged on the source pane alone:

| Package | Version (date) | Source pane | Verdict |
| --- | --- | --- | --- |
| `@uiw/react-md-editor` | 4.1.2 (2026-08-21) | "Based on `textarea` encapsulation": a textarea over a rehype-prism highlighted layer; `preview="edit"` hides its preview | Textarea limits 2 to 5 remain. Pulls in `rehype` and a second Markdown pipeline |
| `@uiw/react-markdown-editor` | 6.1.4 (2025-05-01) | CodeMirror 6 via `@uiw/react-codemirror` | A wrapper around a wrapper, stale for sixteen months |
| `md-editor-rt` | 7.0.0 (2026-09-16) | CodeMirror 6 | Active, but it is a whole product: its dependencies include `markdown-it`, `xss`, `medium-zoom` and `lucide-react` for a preview and toolbar this project would not use |
| `react-markdown-editor-lite` | 1.4.2 (2026-01-21) | Plain textarea; `renderHTML` prop accepts your own renderer; has synced scrolling | The only one whose preview slot fits, but the source pane is just a textarea |
| `easymde` + `react-simplemde-editor` | 2.21.0 / 5.2.0 (2022-10-01) | CodeMirror **5** | Legacy editor generation, React wrapper untouched since 2022 |
| `@mdxeditor/editor` | 4.2.5 (2026-09-13) | Lexical WYSIWYG with a CodeMirror source toggle | WYSIWYG: excluded by the map |
| `react-simple-code-editor` | 0.14.1 (2024-07-04) | Textarea over highlighted `<pre>` | Unmaintained for two years; textarea limits remain |

None beats assembling the same CodeMirror source pane directly, and each adds a second
Markdown renderer the project would never use.

## Sources

- npm registry metadata for every package named (`https://registry.npmjs.org/<name>`):
  versions, publish dates, dependencies, peer dependencies, unpacked size, `repository`.
- GitHub API (`/repos/<owner>/<repo>`): archived flag, last push, open issues, for
  `codemirror/dev`, `replit/codemirror-vim`, `uiwjs/react-codemirror`,
  `suren-atoyan/monaco-react`, `brijeshb42/monaco-vim`, `imzbf/md-editor-rt`,
  `HarryChen0506/react-markdown-editor-lite`.
- Type declarations shipped in `codemirror@6.0.2`, `@codemirror/view@6.43.12`,
  `@codemirror/commands@6.11.1`, `@codemirror/language@6.12.4`, and the
  `@codemirror/commands` source for the `null` indent fallback.
- READMEs: [codemirror/lang-markdown](https://github.com/codemirror/lang-markdown),
  [codemirror/dev](https://github.com/codemirror/dev),
  [replit/codemirror-vim](https://github.com/replit/codemirror-vim/tree/master/packages/codemirror-vim),
  [uiwjs/react-codemirror](https://github.com/uiwjs/react-codemirror),
  [uiwjs/react-md-editor](https://github.com/uiwjs/react-md-editor),
  [suren-atoyan/monaco-react](https://github.com/suren-atoyan/monaco-react),
  [imzbf/md-editor-rt](https://github.com/imzbf/md-editor-rt),
  [HarryChen0506/react-markdown-editor-lite](https://github.com/HarryChen0506/react-markdown-editor-lite).
- [microsoft/monaco-editor `markdown.ts`](https://github.com/microsoft/monaco-editor/blob/main/src/basic-languages/markdown/markdown.ts).
- [MDN: `Document.execCommand()`](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand).
- Installed `@tanstack/react-router@1.170.35` (`ClientOnly.d.ts`) and
  `@tanstack/router-core` (`SSROption`).
