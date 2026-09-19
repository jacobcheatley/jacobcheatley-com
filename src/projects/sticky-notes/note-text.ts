// Baselines after the first sit this many font-sizes apart. The renderer's
// tspans and the editor's text bounds both wrap through here, so a selection
// box can never disagree with the lines drawn inside it.
export const LINE_HEIGHT = 1.2;

// An average glyph's width, in font-sizes.
export const GLYPH_WIDTH = 0.55;

// ponytail: naive width→char estimate off GLYPH_WIDTH plus explicit newlines;
// swap for real text measurement if wrapping drifts from the editor.
export function wrapLines(
  text: string,
  width: number,
  fontSize: number,
): string[] {
  const maxChars = Math.max(1, Math.floor(width / (fontSize * GLYPH_WIDTH)));
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
