import { afterEach, describe, expect, it, vi } from "vitest";
import { fadeScrim, flightHome, flyingFrom, SLIDE_MS } from "./desk";

// The desk's helpers that need a document: the rect handed across the
// submit's navigation, and the scrim's afterimage (#88).
describe("flightHome", () => {
  it("hands the rect over once, and nothing to the next tile that asks", () => {
    const rect = new DOMRect(10, 20, 100, 100);
    flyingFrom(rect);
    expect(flightHome()).toBe(rect);
    expect(flightHome()).toBeUndefined();
  });
});

describe("fadeScrim", () => {
  afterEach(() => vi.useRealTimers());

  it("leaves a scrim that fades and takes itself away", () => {
    vi.useFakeTimers();
    fadeScrim();
    const scrim = document.body.lastElementChild as HTMLElement;
    expect(scrim.className).toContain("bg-black/70");
    expect(scrim.style.opacity).toBe("0");
    vi.advanceTimersByTime(SLIDE_MS);
    expect(scrim.isConnected).toBe(false);
  });
});
