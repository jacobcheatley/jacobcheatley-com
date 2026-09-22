import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "./ShareButton";

// The voting screen's own address, absolute as a share sheet needs it.
const SHARED_LINK = `${window.location.origin}/elemental-showdown`;

// jsdom has neither API, so each test defines the platform it stands for.
function platformWith({
  share,
  writeText = vi.fn(async () => {}),
}: {
  share?: Navigator["share"];
  writeText?: Clipboard["writeText"];
}) {
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return { share, writeText };
}

afterEach(() => vi.restoreAllMocks());

describe("the share button", () => {
  it("hands the link to the share sheet where there is one", async () => {
    const user = userEvent.setup();
    const { share, writeText } = platformWith({ share: vi.fn(async () => {}) });
    render(<ShareButton label="send it to a friend" />);

    await user.click(screen.getByRole("button"));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: SHARED_LINK }),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the link where there is no share sheet, and says so", async () => {
    const user = userEvent.setup();
    const { writeText } = platformWith({ share: undefined });
    render(<ShareButton label="send it to a friend" />);

    await user.click(screen.getByRole("button"));

    expect(writeText).toHaveBeenCalledWith(SHARED_LINK);
    expect(
      await screen.findByRole("button", { name: "link copied" }),
    ).toBeInTheDocument();
  });

  it("takes a dismissed share sheet for the change of mind it is", async () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    platformWith({
      share: vi.fn(() =>
        Promise.reject(new DOMException("share canceled", "AbortError")),
      ),
    });
    render(<ShareButton label="send it to a friend" />);

    await user.click(screen.getByRole("button"));

    expect(failed).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "send it to a friend" }),
    ).toBeInTheDocument();
  });
});
