import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "./ShareButton";

// The voting screen's own address, absolute as a share sheet needs it.
const SHARED_LINK = `${window.location.origin}/elemental-showdown`;

// jsdom brings neither API and userEvent stubs the clipboard, so every test
// says what its platform holds, `undefined` included.
function platformWith(apis: {
  share: Navigator["share"] | undefined;
  clipboard: { writeText: Clipboard["writeText"] } | undefined;
}) {
  for (const [api, value] of Object.entries(apis))
    Object.defineProperty(navigator, api, { value, configurable: true });
  return apis;
}

const aClipboard = () => ({ writeText: vi.fn(async () => {}) });

afterEach(() => vi.restoreAllMocks());

describe("the share button", () => {
  it("hands the link to the share sheet where there is one", async () => {
    const user = userEvent.setup();
    const { share, clipboard } = platformWith({
      share: vi.fn(async () => {}),
      clipboard: aClipboard(),
    });
    render(<ShareButton label="send it to a friend" />);

    await user.click(screen.getByRole("button"));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: SHARED_LINK }),
    );
    expect(clipboard?.writeText).not.toHaveBeenCalled();
  });

  it("copies the link where there is no share sheet, and says so", async () => {
    const user = userEvent.setup();
    const clipboard = aClipboard();
    platformWith({ share: undefined, clipboard });
    render(<ShareButton label="send it to a friend" />);

    await user.click(screen.getByRole("button"));

    expect(clipboard.writeText).toHaveBeenCalledWith(SHARED_LINK);
    expect(
      await screen.findByRole("button", { name: "link copied" }),
    ).toBeInTheDocument();
  });

  it("copies nothing, and claims nothing, where there is neither", async () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    platformWith({ share: undefined, clipboard: undefined });
    render(<ShareButton label="send it to a friend" />);

    await user.click(screen.getByRole("button"));

    expect(failed).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "send it to a friend" }),
    ).toBeInTheDocument();
  });

  it("takes a dismissed share sheet for the change of mind it is", async () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    platformWith({
      share: vi.fn(() =>
        Promise.reject(new DOMException("share canceled", "AbortError")),
      ),
      clipboard: aClipboard(),
    });
    render(<ShareButton label="send it to a friend" />);

    await user.click(screen.getByRole("button"));

    expect(failed).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "send it to a friend" }),
    ).toBeInTheDocument();
  });
});
