import { z } from "zod";

// The Sticky Notes write-path contract: the trust boundary. Shared by the
// server function's validator and the editor's in-browser check, so nothing
// here may import server code. Every object is strict: unknown keys rejected.

// Semantic keys, never raw colour: the shade mapping lives in render code, so
// stored notes never need migrating when the palette is re-tuned.
export const INKS = ["black", "green", "red", "blue"] as const;
export const PAPER_COLOURS = [
  "yellow",
  "pink",
  "blue",
  "green",
  "orange",
  "white",
] as const;
export const FONTS = ["print", "handwritten", "casual", "marker"] as const;
export const FASTENERS = [
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

// Curated set, kept deliberately small.
export const STICKER_EMOJI = [
  "⭐",
  "❤️",
  "🔥",
  "✨",
  "🎉",
  "👍",
  "😀",
  "😎",
  "🥳",
  "🤔",
  "😭",
  "💀",
  "🙏",
  "👀",
  "💯",
  "🌈",
  "🌟",
  "🍀",
  "🌸",
  "🎈",
  "☕",
  "🍕",
  "🐸",
  "🚀",
] as const;

export const MAX_BODY_BYTES = 262_144; // 256 KB serialised
export const MAX_ELEMENTS = 80;
export const MAX_POINTS_PER_STROKE = 1000;
export const MAX_POINTS_TOTAL = 20_000;
export const MAX_TEXT_LEN = 280;

// `w`/`h` still travel in the JSON so every coordinate has a concrete frame,
// but this is the only value accepted.
export const CANVAS = 500;

const coord = z.number().min(-50).max(550);
const rotation = z.number().min(-180).max(180);
const pressure = z.number().min(0).max(1);

// [x, y, pressure] — raw pointer input; perfect-freehand regenerates the
// outline at render time, so the rendered shape is never stored.
const point = z.tuple([coord, coord, pressure]);

// Stored lowercase: the wall is a scruffy corkboard, not a masthead, so a name
// never shouts. Control characters (newlines included) are rejected after the
// lowercasing, so caps can't smuggle one past.
const author = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(50)
  .refine((s) => !/\p{Cc}/u.test(s), "control characters are not allowed");

// Text boxes keep `\n`; every other control character (C0, DEL, C1) is
// stripped. A codepoint filter avoids a regex literal full of control chars.
function stripControlChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl =
      code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    if (ch === "\n" || !isControl) out += ch;
  }
  return out;
}

const textContent = z
  .string()
  .transform((s) => stripControlChars(s.trim()))
  .pipe(z.string().max(MAX_TEXT_LEN));

const strokeElement = z.strictObject({
  type: z.literal("stroke"),
  ink: z.enum(INKS),
  size: z.number().min(1).max(48),
  points: z.array(point).min(1).max(MAX_POINTS_PER_STROKE),
});

const textElement = z.strictObject({
  type: z.literal("text"),
  x: coord,
  y: coord,
  w: z.number().min(1).max(600),
  text: textContent,
  font: z.enum(FONTS),
  color: z.enum(INKS),
  fontSize: z.number().min(8).max(96),
  rotation,
});

const stickerElement = z.strictObject({
  type: z.literal("sticker"),
  x: coord,
  y: coord,
  emoji: z.enum(STICKER_EMOJI),
  scale: z.number().min(0.25).max(4),
  rotation,
});

const element = z.discriminatedUnion("type", [
  strokeElement,
  textElement,
  stickerElement,
]);

// Array order IS z-order.
export const noteContentSchema = z
  .strictObject({
    version: z.literal(1),
    w: z.literal(CANVAS),
    h: z.literal(CANVAS),
    colour: z.enum(PAPER_COLOURS),
    rotation,
    // Per-corner peel of the two bottom corners: 0 flat, 1 fully curled.
    curl: z.strictObject({
      bl: z.number().min(0).max(1),
      br: z.number().min(0).max(1),
    }),
    fastener: z.enum(FASTENERS),
    elements: z.array(element).max(MAX_ELEMENTS),
  })
  .superRefine((note, ctx) => {
    let totalPoints = 0;
    for (const el of note.elements) {
      if (el.type === "stroke") totalPoints += el.points.length;
    }
    if (totalPoints > MAX_POINTS_TOTAL) {
      ctx.addIssue(`too many stroke points (max ${MAX_POINTS_TOTAL})`);
    }
    // Byte-accurate rather than char count: emoji and multibyte text inflate
    // the size the JSONB column has to hold.
    const bytes = new TextEncoder().encode(JSON.stringify(note)).length;
    if (bytes > MAX_BODY_BYTES) {
      ctx.addIssue(`note is too large (max ${MAX_BODY_BYTES} bytes)`);
    }
  });

export const noteSchema = z.strictObject({
  author,
  content: noteContentSchema,
});

export type Ink = (typeof INKS)[number];
export type PaperColour = (typeof PAPER_COLOURS)[number];
export type Font = (typeof FONTS)[number];
export type Fastener = (typeof FASTENERS)[number];

export type NoteContent = z.infer<typeof noteContentSchema>;
export type NoteSubmission = z.infer<typeof noteSchema>;
