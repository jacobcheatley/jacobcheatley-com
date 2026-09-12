import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { noteSchema } from "./note-schema";
import { StickyEditor } from "./StickyEditor";

// The editor talks to the router, the write server-fn, and the fontsource
// loaders — none of which belong in a jsdom unit test. Stub them at the seams;
// the real note-editor model and note-schema contract run for real.
const navigate = vi.fn();
const addNote = vi.fn().mockResolvedValue({ status: "pending" });

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => addNote }));
vi.mock("./sticky-notes.fn", () => ({ addNoteFn: {} }));
vi.mock("./note-fonts", async (orig) => ({
  ...(await orig<typeof import("./note-fonts")>()),
  loadFont: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const surface = () => screen.getByRole("img", { name: /sticky note/i });

describe("StickyEditor", () => {
  it("shows the four tools and the diegetic fastener submit row", () => {
    render(<StickyEditor />);
    for (const t of [/marker/i, /^text$/i, /stickers/i, /select and move/i]) {
      expect(screen.getByRole("button", { name: t })).toBeInTheDocument();
    }
    // choosing a fastener IS the submit — no generic "submit" button
    expect(
      screen.getByRole("button", { name: /pin with red pin/i }),
    ).toBeInTheDocument();
  });

  it("blocks submit until a name is given, and doesn't post", async () => {
    const user = userEvent.setup();
    render(<StickyEditor />);
    await user.click(screen.getByRole("button", { name: /pin with red pin/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/name/i);
    expect(addNote).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("places a text box and pins the note, posting a contract-valid payload", async () => {
    const user = userEvent.setup();
    render(<StickyEditor />);

    await user.type(screen.getByLabelText(/your name/i), "ada");

    // pick the text tool, tap the note to drop a box, type, commit
    await user.click(screen.getByRole("button", { name: /^text$/i }));
    fireEvent.pointerDown(surface(), { clientX: 40, clientY: 60 });
    const input = await screen.findByLabelText(/^text box$/i);
    await user.type(input, "hello wall{Enter}");

    // press a fastener → submit
    await user.click(screen.getByRole("button", { name: /pin with red pin/i }));

    await waitFor(() => expect(addNote).toHaveBeenCalledTimes(1));
    const payload = addNote.mock.calls[0]?.[0]?.data;
    // the emitted payload passes the zod contract (the trust boundary)
    expect(() => noteSchema.parse(payload)).not.toThrow();
    expect(payload.author).toBe("ada");
    expect(payload.content.fastener).toBe("pin-red");
    expect(payload.content.elements).toContainEqual(
      expect.objectContaining({ type: "text", text: "hello wall" }),
    );
    // the pending copy is written to localStorage for the wall overlay
    expect(localStorage.getItem("sticky-notes:pending")).toContain("ada");
  });

  it("reveals the marker inks when the marker is in hand", async () => {
    const user = userEvent.setup();
    render(<StickyEditor />);
    // marker is the default tool, so its inks are visible
    expect(
      screen.getByRole("button", { name: /green ink/i }),
    ).toBeInTheDocument();
    // switching to select hides them
    await user.click(screen.getByRole("button", { name: /select and move/i }));
    expect(screen.queryByRole("button", { name: /green ink/i })).toBeNull();
  });
});
