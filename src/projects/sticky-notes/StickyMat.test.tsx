import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

  it("links back to the wall", () => {
    render(<StickyMat up={true} />);
    expect(screen.getByRole("link", { name: /the wall/i })).toHaveAttribute(
      "href",
      "/sticky-notes",
    );
  });
});
