import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

// The Blog wears none of the Portfolio's shell: this column, headed by the way
// back to the Portfolio, is every Blog page.
export function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[calc(44rem+2rem)] px-4 pt-[clamp(2rem,6vw,4rem)] pb-24">
      <nav className="mb-[clamp(2.5rem,6vw,4rem)] flex items-baseline gap-[0.6rem] text-[1.25rem]">
        <Link
          to="/"
          className="font-medium italic text-name no-underline hover:underline"
        >
          Jacob Cheatley
        </Link>
        <span className="text-muted">/</span>
        <h1 className="italic">Blog</h1>
      </nav>
      {children}
    </main>
  );
}
