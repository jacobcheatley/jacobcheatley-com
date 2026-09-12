import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuestbookForm } from "./GuestbookForm";
import { addEntryFn } from "./guestbook.fn";

// useServerFn needs a router context we don't want to build; the identity mock
// lets the form call the mocked server function directly.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("./guestbook.fn", () => ({ addEntryFn: vi.fn() }));

const addEntryFnMock = vi.mocked(addEntryFn);

describe("GuestbookForm", () => {
  beforeEach(() => {
    addEntryFnMock.mockReset();
  });

  it("renders name and message fields", () => {
    render(<GuestbookForm />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
  });

  it("shows a validation message for an empty name and does not call the server", async () => {
    const user = userEvent.setup();
    render(<GuestbookForm />);
    await user.type(screen.getByLabelText(/message/i), "hello");
    await user.click(screen.getByRole("button"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(addEntryFnMock).not.toHaveBeenCalled();
  });

  it("disables submit while in flight, then shows the confirmation", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { status: "pending" }) => void;
    addEntryFnMock.mockReturnValue(
      new Promise<{ status: "pending" }>((r) => {
        resolve = r;
      }),
    );

    render(<GuestbookForm />);
    await user.type(screen.getByLabelText(/name/i), "Ada");
    await user.type(screen.getByLabelText(/message/i), "hello");
    await user.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled());
    expect(addEntryFnMock).toHaveBeenCalledWith({
      data: { name: "Ada", message: "hello" },
    });

    resolve({ status: "pending" });

    expect(
      await screen.findByText(/appear once it has been approved/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });
});
