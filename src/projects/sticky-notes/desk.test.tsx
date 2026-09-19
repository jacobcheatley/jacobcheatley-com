import { afterEach, describe, expect, it, vi } from "vitest";
import { fadeScrim, flyingFrom, SLIDE_MS, takeFlightHome } from "./desk";

describe("takeFlightHome", () => {
  it("hands the rect over once, and nothing to the next tile that asks", () => {
    const rect = new DOMRect(10, 20, 100, 100);
    flyingFrom(rect);
    expect(takeFlightHome()).toBe(rect);
    expect(takeFlightHome()).toBeUndefined();
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
