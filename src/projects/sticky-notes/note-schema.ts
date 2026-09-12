import { z } from "zod";

// The Sticky Notes write-path contract: the trust boundary. Shared by the
// server function's `.validator` (server side) and the editor's in-browser
// check (client side), so nothing here may import server code. Every object is
// `.strict()` (via `z.strictObject`) — unknown keys are rejected, not dropped.
//
// See CONTEXT.md → "Sticky Notes" for the domain terms, and the build spec
// (#57) / storage ticket (#58) for the caps below.

// Semantic enum keys, never raw colour — the shade mapping lives in render code
// so stored notes never need migrating when the palette is re-tuned.
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
export const FASTENERS = ["pin", "tape", "staple", "stick"] as const;

// Curated sticker set. Kept small on purpose; re-tunable without a migration
// since only the key is stored. The editor (#61) surfaces exactly these.
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

// Caps — see the build spec. Named so the tests and any future tuning read the
// same numbers.
export const MAX_BODY_BYTES = 262_144; // 256 KB serialised
export const MAX_ELEMENTS = 80;
export const MAX_POINTS_PER_STROKE = 1000;
export const MAX_POINTS_TOTAL = 20_000;
export const MAX_TEXT_LEN = 280;

// The note-local canvas is a server-enforced constant; `w`/`h` still travel in
// the JSON so every coordinate has a concrete frame, but only 500 is accepted.
export const CANVAS = 500;

const coord = z.number().min(-50).max(550);
const rotation = z.number().min(-180).max(180);
const pressure = z.number().min(0).max(1);

// [x, y, pressure] — raw pointer input; perfect-freehand regenerates the
// outline at render time (#59), so we never store the rendered shape.
const point = z.tuple([coord, coord, pressure]);

// Author and timestamps are DB columns, not part of the content blob. Interior
// control characters (newlines included) are rejected outright.
const author = z
  .string()
  .trim()
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

// The content blob the editor emits and the wall + CLI consume. `version: 1`
// leaves room for forward migration; array order IS z-order.
export const noteContentSchema = z
  .strictObject({
    version: z.literal(1),
    w: z.literal(CANVAS),
    h: z.literal(CANVAS),
    colour: z.enum(PAPER_COLOURS),
    rotation,
    curl: z.number().min(0).max(1),
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
    // Guards the JSONB column against a giant payload. Byte-accurate rather than
    // char-count, since emoji and multibyte text inflate the stored size.
    const bytes = new TextEncoder().encode(JSON.stringify(note)).length;
    if (bytes > MAX_BODY_BYTES) {
      ctx.addIssue(`note is too large (max ${MAX_BODY_BYTES} bytes)`);
    }
  });

// The full submission payload: author + content. The server function validates
// with this; the server re-validation is what makes it the trust boundary.
export const noteSchema = z.strictObject({
  author,
  content: noteContentSchema,
});

export type NoteContent = z.infer<typeof noteContentSchema>;
export type NoteSubmission = z.infer<typeof noteSchema>;
