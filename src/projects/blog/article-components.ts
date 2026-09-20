import type { Root, RootContent } from "mdast";
import { SKIP, visit } from "unist-util-visit";

// A directive an Article names reaches a component through the tag its
// registry key spells. Everything else is prose, because `10:30` and `a:b`
// parse as text directives too, so it goes back exactly as it was written.
export function remarkArticleComponents(
  registeredTagNames: ReadonlySet<string>,
) {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);

    visit(tree, (node, index, parent) => {
      // A diagram is drawn in the browser, so its fence becomes the component
      // holding the source rather than going on to the highlighter as code.
      if (
        node.type === "code" &&
        node.lang === "mermaid" &&
        parent &&
        index !== undefined
      ) {
        parent.children[index] = {
          type: "leafDirective",
          name: "mermaid",
          children: [],
          data: {
            hName: "directive-mermaid",
            hProperties: { source: node.value },
          },
        };
        return SKIP;
      }

      if (
        node.type !== "containerDirective" &&
        node.type !== "leafDirective" &&
        node.type !== "textDirective"
      ) {
        return;
      }

      const tagName = `directive-${node.name}`;
      if (registeredTagNames.has(tagName)) {
        node.data = { hName: tagName, hProperties: node.attributes ?? {} };
        return;
      }

      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (
        !parent ||
        index === undefined ||
        start === undefined ||
        end === undefined
      ) {
        return;
      }

      const asWritten = source.slice(start, end);
      const restored: RootContent =
        node.type === "textDirective"
          ? { type: "text", value: asWritten }
          : {
              type: "paragraph",
              children: [{ type: "text", value: asWritten }],
            };
      parent.children[index] = restored;
      return SKIP;
    });
  };
}
