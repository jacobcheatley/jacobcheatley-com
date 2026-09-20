import type { Element, Root, RootContent } from "hast";

// What the renderer stamps every top-level block with, and the writing room
// reads back off the preview. On the public page they are inert.
export const sourceStartAttribute = "data-source-start";
export const sourceEndAttribute = "data-source-end";

// The stamp as a directive component receives it, so the block it renders can
// carry it on to the page.
export type SourceStamp = {
  [sourceStartAttribute]?: number;
  [sourceEndAttribute]?: number;
};

type SourceLines = { start: number; end: number };

// Shiki swaps a highlighted fence for a fragment of its own making, which
// carries no position, so every top-level block's lines are read while they
// are still there and stamped on once it has run.
const heldLines = new WeakMap<Root, (SourceLines | undefined)[]>();

// remark-gfm builds the footnotes section out of no source of its own, and
// the line endings between blocks are text, not blocks.
function sourceLinesOf(node: RootContent): SourceLines | undefined {
  const position = node.position;
  return position && { start: position.start.line, end: position.end.line };
}

export function rehypeHoldSourceLines() {
  return (tree: Root) => {
    heldLines.set(tree, tree.children.map(sourceLinesOf));
  };
}

// A fragment Shiki left behind holds the one element the fence became.
function blocksOf(node: RootContent | Root): Element[] {
  if (node.type === "element") return [node];
  if (node.type === "root")
    return node.children.filter((child) => child.type === "element");
  return [];
}

export function rehypeStampSourceLines() {
  return (tree: Root) => {
    const held = heldLines.get(tree) ?? [];
    tree.children.forEach((child, index) => {
      const lines = sourceLinesOf(child) ?? held[index];
      if (!lines) return;
      for (const block of blocksOf(child)) {
        block.properties[sourceStartAttribute] = lines.start;
        block.properties[sourceEndAttribute] = lines.end;
      }
    });
  };
}
