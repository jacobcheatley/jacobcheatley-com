import type { ReactNode } from "react";

// One tile per Active Element, drawn the same on the locked screen and under
// the unlock's wave: the flip only lands if the two grids are one grid.

// How many tiles wide the mosaic is, which the wave reads a tile's row and
// column out of.
export const MOSAIC_COLUMNS = 13;

// What every tile wears, blank or flipped.
export const MOSAIC_TILE = "aspect-square rounded-md";

export const Mosaic = ({ children }: { children: ReactNode }) => (
  <div aria-hidden className="grid grid-cols-13 gap-[3px]">
    {children}
  </div>
);
