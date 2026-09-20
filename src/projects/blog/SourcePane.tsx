import { indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

// CodeMirror writes its own stylesheet, so the pane takes the palette as the
// tokens themselves: light and dark then come from the page, not from a
// second theme.
const siteTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.9375rem",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-ink)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "1.5rem 0.5rem", caretColor: "var(--color-ink)" },
  ".cm-cursor": { borderLeftColor: "var(--color-ink)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--color-muted)",
    border: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--color-line) 40%, transparent)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 25%, transparent)",
  },
});

// The Markdown and the code inside its fences in the Article's own colours:
// accent for what names things, accent-2 for the values, muted for the marks.
const siteHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "var(--color-accent)" },
  { tag: tags.monospace, color: "var(--color-accent-2)" },
  {
    tag: [tags.comment, tags.quote],
    color: "var(--color-muted)",
    fontStyle: "italic",
  },
  {
    tag: [
      tags.processingInstruction,
      tags.meta,
      tags.punctuation,
      tags.bracket,
      tags.labelName,
    ],
    color: "var(--color-muted)",
  },
  {
    tag: [
      tags.keyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.definitionKeyword,
    ],
    color: "var(--color-accent)",
  },
  {
    tag: [tags.string, tags.number, tags.bool, tags.atom, tags.null],
    color: "var(--color-accent-2)",
  },
]);

// The editor owns the text: it is built once, so every prop is read at mount
// and must keep its identity. Nothing is built on the server, so the first
// render is the empty div it hydrates into.
export function SourcePane({
  initialMarkdown,
  onChange,
}: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}) {
  const pane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new EditorView({
      parent: pane.current ?? undefined,
      doc: initialMarkdown,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(siteHighlight),
        siteTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    });
    return () => view.destroy();
  }, [initialMarkdown, onChange]);

  return <div ref={pane} className="h-full overflow-hidden" />;
}
