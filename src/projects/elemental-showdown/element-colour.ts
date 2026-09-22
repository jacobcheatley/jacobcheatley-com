// Elemental Showdown wears its own two colours in light and dark alike: an
// Element's colour edge to edge, with ink and white as the only chrome.
export const INK = "#14110f";
export const PAPER = "#ffffff";

// sRGB gamma, so the luminance below is the one the eye reads.
const linearChannelAt = (colour: string, at: number) => {
  const channel = Number.parseInt(colour.slice(at, at + 2), 16) / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
};

// Where the line falls between an Element that carries ink and one that carries
// white. Above the midpoint, because ink on a mid colour still reads.
const INK_ABOVE = 0.4;

// The Element colours are owner-tuned and never checked for contrast, so every
// word over one picks its side here.
export function textOn(colour: string) {
  const red = linearChannelAt(colour, 1);
  const green = linearChannelAt(colour, 3);
  const blue = linearChannelAt(colour, 5);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > INK_ABOVE
    ? INK
    : PAPER;
}
