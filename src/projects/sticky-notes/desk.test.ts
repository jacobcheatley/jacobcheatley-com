import { describe, expect, it } from "vitest";
import { flightTransform } from "./desk";

// The pinned note's flight, as the numbers it starts from: the wall tile moved
// and scaled so the sheet in it lies back where the sheet lay on the mat.
describe("flightTransform", () => {
  it("moves a tile the size of the sheet straight back over it", () => {
    const sheet = { left: 40, top: 300, width: 120, height: 120 };
    const tile = { left: 200, top: 20, width: 120, height: 120 };

    expect(flightTransform(sheet, tile)).toEqual({
      dx: -160,
      dy: 280,
      scale: 1,
    });
  });

  it("scales a small tile up to the sheet, and lifts it by its scaled headroom", () => {
    // a 100px sheet under 20px of fastener headroom, from a 200px sheet
    const sheet = { left: 0, top: 0, width: 200, height: 200 };
    const tile = { left: 100, top: 100, width: 100, height: 120 };

    const { dx, dy, scale } = flightTransform(sheet, tile);

    expect({ dx, dy, scale }).toEqual({ dx: -50, dy: -80, scale: 2 });
    // the paper's own centre, once scaled about the tile's and moved, is the
    // sheet's centre: 10px of headroom below the tile's, doubled
    expect(tile.top + tile.height / 2 + (scale * 20) / 2 + dy).toBe(100);
  });
});
