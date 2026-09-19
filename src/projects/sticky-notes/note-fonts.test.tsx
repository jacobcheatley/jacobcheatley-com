import { expect, it, vi } from "vitest";
import { loadFont } from "./note-fonts";

vi.mock("@fontsource/patrick-hand", () => {
  throw new Error("chunk failed to load");
});

it("loadFont warns, rather than rejects, when a webfont fails to load", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(loadFont("casual")).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'loading the "casual" webfont failed',
      cause: expect.anything(),
    }),
  );
});
