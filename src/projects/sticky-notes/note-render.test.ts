import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FONT_FAMILIES } from "./note-fonts";
import { NoteRender } from "./note-render";
import type { NoteContent } from "./note-schema";

// createElement (not JSX) keeps this a .test.ts in the node project, which also
// proves the acceptance criterion: NoteRender renders with no browser/DOM.
function render(content: NoteContent) {
  return renderToStaticMarkup(createElement(NoteRender, { content }));
}

const content: NoteContent = {
  version: 1,
  w: 500,
  h: 500,
  colour: "yellow",
  rotation: 0,
  curl: { bl: 0, br: 0 },
  fastener: "pin-red",
  elements: [
    {
      type: "stroke",
      ink: "red",
      size: 8,
      points: [
        [10, 10, 0.5],
        [20, 20, 0.6],
        [30, 10, 0.5],
      ],
    },
    {
      type: "text",
      x: 40,
      y: 60,
      w: 180,
      text: "hello",
      font: "casual",
      color: "black",
      fontSize: 24,
      rotation: 0,
    },
    { type: "sticker", x: 120, y: 90, emoji: "⭐", scale: 1, rotation: 0 },
  ],
};

describe("NoteRender", () => {
  it("emits a 500×500 svg with the stroke, text, and sticker in array (z-)order", () => {
    const svg = render(content);
    // the note is 500×500 with transparent headroom above for an overhanging fastener
    expect(svg).toContain('viewBox="0 -40 500 540"');

    // locate the stroke by its red ink fill (the first <path is the paper)
    const iStroke = svg.indexOf("#dc2626");
    const iText = svg.indexOf("hello");
    const iSticker = svg.indexOf("⭐");
    expect(iStroke).toBeGreaterThanOrEqual(0);
    expect(iText).toBeGreaterThanOrEqual(0);
    expect(iSticker).toBeGreaterThanOrEqual(0);
    // array order is z-order: stroke, then text, then sticker
    expect(iStroke).toBeLessThan(iText);
    expect(iText).toBeLessThan(iSticker);
  });

  it("renders a distinct fastener for each key", () => {
    const keys = [
      "none",
      "pin-red",
      "pin-green",
      "pin-yellow",
      "pin-blue",
      "tape",
      "staple",
      "staples",
      "stick",
    ] as const;
    const outputs = keys.map((fastener) => render({ ...content, fastener }));
    const out = (k: (typeof keys)[number]) => outputs[keys.indexOf(k)] ?? "";
    // every fastener produces different output
    expect(new Set(outputs).size).toBe(keys.length);
    expect(out("pin-red")).toContain("#e11d48"); // red pin head
    expect(out("pin-blue")).toContain("#2563eb"); // blue pin head
    // the single staple and the two-corner staples differ
    expect(out("staples")).not.toBe(out("staple"));
  });

  it("folds a bottom corner only when its curl > 0", () => {
    const flat = render({ ...content, curl: { bl: 0, br: 0 } });
    const curled = render({ ...content, curl: { bl: 0, br: 0.6 } });
    // the fold's lift shadow is only emitted when a corner is curled
    expect(flat).not.toContain("feDropShadow");
    expect(curled).toContain("feDropShadow");
  });

  it("is deterministic and needs no DOM", () => {
    expect(render(content)).toBe(render(content));
  });

  it("resolves each font enum key to its fontsource family", () => {
    expect(FONT_FAMILIES.print).toContain("IBM Plex Sans");
    expect(FONT_FAMILIES.handwritten).toContain("Caveat");
    expect(FONT_FAMILIES.casual).toContain("Patrick Hand");
    expect(FONT_FAMILIES.marker).toContain("Permanent Marker");
  });
});
