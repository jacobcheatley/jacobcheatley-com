import type { Font } from "./note-schema";

// Families live in render code, not the stored blob, so they can change without
// migrating notes. Each keeps a generic fallback for the first-paint window
// before its webfont loads.
export const FONT_FAMILIES: Record<Font, string> = {
  print: '"IBM Plex Sans", sans-serif',
  handwritten: '"Caveat Variable", cursive',
  casual: '"Patrick Hand", cursive',
  marker: '"Permanent Marker", cursive',
};

// Importing a @fontsource package pulls in its CSS as a side effect, so these
// are browser-only: never call one under SSR/Node. `print` needs no loader,
// styles.css already loads IBM Plex Sans globally.
const LOADERS: Partial<Record<Font, () => Promise<unknown>>> = {
  handwritten: () => import("@fontsource-variable/caveat"),
  casual: () => import("@fontsource/patrick-hand"),
  marker: () => import("@fontsource/permanent-marker"),
};

export function loadFont(font: Font): Promise<unknown> {
  return LOADERS[font]?.() ?? Promise.resolve();
}
