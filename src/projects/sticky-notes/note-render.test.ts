import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FONT_FAMILIES } from "./note-fonts";
import {
  FASTENER_MARGIN,
  FastenerPreview,
  NOTE_PAPER_ASPECT_RATIO,
  NotePaper,
  NoteRender,
  PREVIEW_DEPTH,
} from "./note-render";
import { CANVAS, FASTENERS, type NoteContent } from "./note-schema";

// createElement (not JSX) keeps this a .test.ts in the node project, which also
// proves the acceptance criterion: NoteRender renders with no browser/DOM.
function render(content: NoteContent) {
  return renderToStaticMarkup(createElement(NoteRender, { content }));
}

function renderPaper(content: NoteContent) {
  return renderToStaticMarkup(createElement(NotePaper, { content }));
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
      "tape-masking",
      "tape-clear",
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

  it("draws the fixed nib whatever pressure a point carries", () => {
    // a marker has no pressure (#84): a mouse (0.5), a touch (0 or 1) and a
    // pen (light force) all stored a number here, and all must render alike
    const stroke = (pressure: number): NoteContent => ({
      ...content,
      elements: [
        {
          type: "stroke",
          ink: "red",
          size: 8,
          points: [
            [10, 10, pressure],
            [20, 20, pressure],
            [30, 10, pressure],
          ],
        },
      ],
    });
    const d = (c: NoteContent) =>
      render(c)
        .match(/ d="([^"]*)"/g)
        ?.join("") ?? "";
    expect(d(stroke(0.1))).not.toBe("");
    expect(d(stroke(0.1))).toBe(d(stroke(1)));
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

describe("NotePaper", () => {
  it("is the bare 500-square sheet: no fastener headroom", () => {
    expect(renderPaper(content)).toContain('viewBox="0 0 500 500"');
    expect(NOTE_PAPER_ASPECT_RATIO).toBe(1);
  });

  it("draws no fastener even when the note carries one", () => {
    // the note's pin-red would show its head gradient in the composed render
    expect(render(content)).toContain("#e11d48");
    expect(renderPaper(content)).not.toContain("#e11d48");
  });

  it("keeps the paper layer identical to the composed render", () => {
    const paper = renderPaper({ ...content, curl: { bl: 0.4, br: 0.6 } });
    // same content, same folds — the mat shows exactly what the wall will
    expect(paper).toContain("hello");
    expect(paper).toContain("\u2b50");
    expect(paper).toContain("feDropShadow");
  });
});

describe("FastenerPreview", () => {
  const preview = (fastener: (typeof FASTENERS)[number]) =>
    renderToStaticMarkup(createElement(FastenerPreview, { fastener }));

  it("renders a distinct strip for every fastener", () => {
    const outputs = FASTENERS.map(preview);
    expect(new Set(outputs).size).toBe(FASTENERS.length);
    // the strip is the fastener's headroom plus a shallow slice of paper
    const viewBox = `viewBox="0 ${-FASTENER_MARGIN} ${CANVAS} ${PREVIEW_DEPTH + FASTENER_MARGIN}"`;
    for (const svg of outputs) expect(svg).toContain(viewBox);
  });

  it("reuses the wall's drawing code, so a preview matches the real thing", () => {
    expect(preview("pin-red")).toContain("#e11d48");
    expect(preview("stick")).toContain("#5b7fc4");
  });

  it("renders the bare strip for none", () => {
    expect(preview("none")).not.toContain("radialGradient");
    expect(preview("none")).toContain("#fde68a"); // default yellow paper
  });

  it("tints the strip with the note's paper colour", () => {
    const pink = renderToStaticMarkup(
      createElement(FastenerPreview, { fastener: "none", colour: "pink" }),
    );
    expect(pink).toContain("#fbcfe8");
  });
});
