import type { CSSProperties } from "react";

// The desk's shared look, kept out of both components that wear it. The mat
// surface (StickyMat) SSRs with the wall; everything that lies ON it
// (StickyEditor) is a lazy chunk, so neither may own constants the other
// imports — a static import either way would pull the editor into the wall's
// bundle. This module is the one both sides read from.

// Motion, all CSS: no animation library anywhere in this spec (#69). The
// prototype's ease-out (#70): quick off the mark, long settle.
export const EASE_OUT = "cubic-bezier(.2,.8,.25,1)";

// Cool slate cutting mat (spec #49): grid rules over a dark wash, distinct from
// the wall's warm cork.
export const DESK_BG: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "radial-gradient(120% 120% at 50% 0%, #2a2f36, #171a1f)",
  ].join(", "),
  backgroundSize: "26px 26px, 26px 26px, cover",
};

// A strip of masking tape stuck to the mat — the label style for the mat's own
// controls (the pinning phase adds its own in T7).
export const TAPE: CSSProperties = {
  backgroundColor: "#e8dcae",
  backgroundImage: [
    "linear-gradient(180deg, rgba(255,255,255,.45), rgba(0,0,0,.06))",
    "repeating-linear-gradient(90deg, rgba(160,140,90,.10) 0 3px, transparent 3px 7px)",
  ].join(", "),
  boxShadow: "0 2px 5px rgba(0,0,0,.4)",
  clipPath: "polygon(3% 0, 97% 2%, 100% 96%, 96% 100%, 4% 98%, 0 4%)",
  transform: "rotate(-2.2deg)",
};
