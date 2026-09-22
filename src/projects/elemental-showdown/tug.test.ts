import { describe, expect, it } from "vitest";
import type { ShownElement } from "./showdown-stats";
import {
  draggedVote,
  seamAt,
  steppedVote,
  tabLabel,
  voteSentence,
} from "./tug";

const element = (name: string, emoji: string): ShownElement => ({
  id: name.length,
  name,
  emoji,
  colour: "#f2541b",
});

const fire = element("fire", "🔥");
const water = element("water", "💧");

describe("draggedVote", () => {
  it("leaves a drag that never left the middle too close to call", () => {
    expect(draggedVote(0)).toBe(0);
    expect(draggedVote(35)).toBe(0);
    expect(draggedVote(-35)).toBe(0);
  });

  it("snaps one step to a weak win", () => {
    expect(draggedVote(36)).toBe(1);
    expect(draggedVote(109)).toBe(1);
    expect(draggedVote(-36)).toBe(-1);
  });

  it("snaps two steps to a strong win, and no further however long the drag", () => {
    expect(draggedVote(110)).toBe(2);
    expect(draggedVote(900)).toBe(2);
    expect(draggedVote(-110)).toBe(-2);
  });
});

describe("steppedVote", () => {
  it("moves the seam one step at a time", () => {
    expect(steppedVote(0, 1)).toBe(1);
    expect(steppedVote(1, 1)).toBe(2);
    expect(steppedVote(0, -1)).toBe(-1);
  });

  it("stops at a strong win for either Element", () => {
    expect(steppedVote(2, 1)).toBe(2);
    expect(steppedVote(-2, -1)).toBe(-2);
  });
});

describe("seamAt", () => {
  it("rests in the middle when the Matchup is too close to call", () => {
    expect(seamAt(0)).toBe(50);
  });

  it("gives the winner ground, a step at a time", () => {
    expect(seamAt(1)).toBe(67);
    expect(seamAt(2)).toBe(84);
    expect(seamAt(-2)).toBe(16);
  });
});

describe("voteSentence", () => {
  it("reads a win from the Element the seam moved for", () => {
    expect(voteSentence(1, fire, water)).toBe("fire beats water");
    expect(voteSentence(2, fire, water)).toBe("fire crushes water");
    expect(voteSentence(-1, fire, water)).toBe("water beats fire");
    expect(voteSentence(-2, fire, water)).toBe("water crushes fire");
  });

  it("calls the middle what it is", () => {
    expect(voteSentence(0, fire, water)).toBe("too close to call");
  });
});

describe("tabLabel", () => {
  it("names the winner by emoji, because the tab sits in the loser's colour", () => {
    expect(tabLabel(2, fire, water)).toBe("🔥 crushes");
    expect(tabLabel(-1, fire, water)).toBe("💧 beats");
  });

  it("has no winner to name in the middle", () => {
    expect(tabLabel(0, fire, water)).toBe("too close");
  });
});
