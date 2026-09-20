import type { Element, Root, RootContent } from "hast";

// What the renderer stamps every top-level block with, and the writing room
// reads back off the preview. On the public page they are inert.
const sourceStartAttribute = "data-source-start";
const sourceEndAttribute = "data-source-end";

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

// One stamped block of the preview, measured in the pane it scrolls in.
export type PreviewBlock = {
  startLine: number;
  endLine: number;
  offsetTop: number;
  height: number;
};

export type PreviewLayout = {
  blocks: readonly PreviewBlock[];
  maxScrollTop: number;
};

export type SourceScroll = {
  topLine: number;
  scrollTop: number;
  maxScrollTop: number;
};

// The preview follows the source and never the other way about, so this is
// the whole of the scrolling the writing room does.
export function followSourceScroll(pane: HTMLElement, source: SourceScroll) {
  const paneTop = pane.getBoundingClientRect().top;
  const blocks = [...pane.querySelectorAll(`[${sourceStartAttribute}]`)].map(
    (block): PreviewBlock => {
      const box = block.getBoundingClientRect();
      return {
        startLine: Number(block.getAttribute(sourceStartAttribute)),
        endLine: Number(block.getAttribute(sourceEndAttribute)),
        offsetTop: box.top - paneTop + pane.scrollTop,
        height: box.height,
      };
    },
  );
  pane.scrollTop = previewScrollTop(source, {
    blocks,
    maxScrollTop: pane.scrollHeight - pane.clientHeight,
  });
}

// Where the preview sits so that what the source pane shows at its top is at
// the top of it. Both ends pin, so the head and the foot of an Article are
// reachable however differently its blocks render.
export function previewScrollTop(
  source: SourceScroll,
  preview: PreviewLayout,
): number {
  if (source.scrollTop <= 0) return 0;
  if (source.scrollTop >= source.maxScrollTop) return preview.maxScrollTop;

  const above = preview.blocks.filter(
    ({ startLine }) => startLine <= source.topLine,
  );
  const block = above.at(-1) ?? preview.blocks[0];
  if (!block) return 0;

  // A line beyond the block's last one is between blocks, which puts the
  // preview at its foot, where the next block starts.
  const lines = block.endLine - block.startLine + 1;
  const through = Math.min(1, (source.topLine - block.startLine) / lines);
  return block.offsetTop + block.height * Math.max(0, through);
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
