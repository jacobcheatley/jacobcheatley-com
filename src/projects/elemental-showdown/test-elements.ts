import type { ShowdownElement } from "./schema";
import type { ElementKind } from "./showdown-schema";

// An Element for a test that cares only about its id, its name and whether it
// is Common and Active. A test that reads an emoji or a colour off the screen
// writes its own Elements.
export const element = (
  id: number,
  name: string,
  {
    kind = "common",
    isActive = true,
  }: { kind?: ElementKind; isActive?: boolean } = {},
): ShowdownElement => ({
  id,
  name,
  emoji: "🔥",
  colour: "#f2541b",
  kind,
  isActive,
});
