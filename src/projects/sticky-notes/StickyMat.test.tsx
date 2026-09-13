import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StickyMat } from "./StickyMat";

// TanStack's <Link> needs a router context; the wall's own test stubs it the
// same way. The route → `up` derivation itself is one `useMatch` call in
// `src/routes/sticky-notes.tsx`; mounting the real route tree here would drag in
// the root shell document and the loader's server fn for one boolean, so the mat
// is tested at its prop and the derivation is left to the browser check.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: React.PropsWithChildren<{ to?: string }>) => (
    <a href={to}>{children}</a>
  ),
}));

const mat = (container: HTMLElement) => container.firstElementChild;

afterEach(() => vi.useRealTimers());

describe("StickyMat", () => {
  it("is parked below the wall when the route is the wall", () => {
    const { container } = render(<StickyMat up={false} />);
    expect(mat(container)).toHaveStyle({ transform: "translateY(100%)" });
  });

  it("covers the wall when the route is the editor", () => {
    const { container } = render(<StickyMat up={true} />);
    expect(mat(container)).toHaveStyle({ transform: "translateY(0)" });
  });

  it("SSRs a direct /sticky-notes/new load already up, with no slide", () => {
    // The transition is armed by an effect, so the server's markup — and the
    // first client paint that hydrates it — carry none: the mat is just there.
    const html = renderToStaticMarkup(<StickyMat up={true} />);
    expect(html).toContain("translateY(0)");
    expect(html).toContain("transition:none");
  });

  it("keeps the island mounted once the mat has been up", async () => {
    // The acceptance criterion behind the latch: a half-built note must survive
    // mat-down, so the editor may not unmount when the route goes back to the
    // wall. The stack trigger is the island's stable marker.
    const { rerender } = render(<StickyMat up={true} />);
    const editor = await screen.findByRole("button", {
      name: /fan out the pads/i,
    });

    rerender(<StickyMat up={false} />);
    expect(editor).toBeInTheDocument();
  });

  it("goes inert only once it has finished sliding down", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<StickyMat up={true} />);
    expect(mat(container)).not.toHaveAttribute("inert");

    rerender(<StickyMat up={false} />);
    // mid-slide the mat is still on screen, so it stays reachable
    expect(mat(container)).not.toHaveAttribute("inert");

    act(() => void vi.advanceTimersByTime(1000));
    expect(mat(container)).toHaveAttribute("inert");
  });

  it("links back to the wall", () => {
    render(<StickyMat up={true} />);
    expect(screen.getByRole("link", { name: /the wall/i })).toHaveAttribute(
      "href",
      "/sticky-notes",
    );
  });
});
