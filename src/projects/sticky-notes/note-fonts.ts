import type { Font } from "./note-schema";

// Enum key → the CSS font-family NoteRender sets on text. Kept in render-side
// code (not the stored blob) so families can change without migrating notes.
// Every family has a generic fallback for the SSR/first-paint window before its
// webfont loads.
export const FONT_FAMILIES: Record<Font, string> = {
  print: '"IBM Plex Sans", sans-serif',
  handwritten: '"Caveat Variable", cursive',
  casual: '"Patrick Hand", cursive',
  marker: '"Permanent Marker", cursive',
};

// Lazy webfont loaders — importing a @fontsource package pulls in its CSS as a
// side effect. Browser-only: never call these under SSR/Node (NoteRender itself
// never does, so it stays pure). `print` (IBM Plex Sans) is already loaded
// globally via styles.css, so it has no loader here.
const LOADERS: Partial<Record<Font, () => Promise<unknown>>> = {
  handwritten: () => import("@fontsource-variable/caveat"),
  casual: () => import("@fontsource/patrick-hand"),
  marker: () => import("@fontsource/permanent-marker"),
};

export function loadFont(font: Font): Promise<unknown> {
  return LOADERS[font]?.() ?? Promise.resolve();
}
