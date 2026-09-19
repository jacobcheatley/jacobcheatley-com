import { describe, expect, it } from "vitest";
import { centreOffset, flightTransform } from "./desk";

describe("centreOffset", () => {
  const stage = { left: 100, top: 0, width: 300, height: 300 }; // centre 250, 150

  it("measures from one box's centre to another's", () => {
    const pad = { left: 0, top: 400, width: 100, height: 100 }; // centre 50, 450
    expect(centreOffset(pad, stage)).toEqual({ dx: -200, dy: 300 });
  });

  it("is no move at all when a box isn't there to measure", () => {
    expect(centreOffset(undefined, stage)).toEqual({ dx: 0, dy: 0 });
    expect(centreOffset(stage, undefined)).toEqual({ dx: 0, dy: 0 });
  });
});

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

  it("corrects nothing between two boxes of the same shape", () => {
    // the Spotlight and a wall tile are both the composed note, headroom and
    // all, so their box centres already put their paper in the same place
    const lifted = { left: 0, top: 0, width: 200, height: 216 };
    const tile = { left: 300, top: 400, width: 100, height: 108 };

    expect(flightTransform(lifted, tile)).toEqual({
      ...centreOffset(lifted, tile),
      scale: 2,
    });
  });
});
