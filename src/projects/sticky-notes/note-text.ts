// Text wrapping shared by the renderer and the editor's geometry. It lives on
// its own so `bounds()` measures exactly the lines `NoteRender` draws — two
// copies of this heuristic would drift and put the selection box in the wrong
// place.

// Baselines after the first sit this many font-sizes apart. Shared so the
// renderer's tspans and the editor's text bounds can never disagree.
export const LINE_HEIGHT = 1.2;

// ponytail: naive width→char estimate (avg glyph ≈ 0.55·fontSize) plus explicit
// newlines. Good enough for the wall/CLI; swap for real text measurement if
// wrapping visibly drifts from the editor.
export function wrapLines(
  text: string,
  width: number,
  fontSize: number,
): string[] {
  const maxChars = Math.max(1, Math.floor(width / (fontSize * 0.55)));
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}
