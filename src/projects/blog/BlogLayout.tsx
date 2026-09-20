import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

// The Blog wears none of the Portfolio's shell: this column, headed by the way
// back to the Portfolio, is every Blog page. What follows the name is the
// page's own: the heading on the listing, the way back to it everywhere else.
export function BlogLayout({
  heading,
  children,
}: {
  heading: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="blog-layout mx-auto max-w-[calc(44rem+2rem)] px-4 pt-[clamp(2rem,6vw,4rem)] pb-24">
      <nav className="mb-[clamp(2.5rem,6vw,4rem)] flex items-baseline gap-[0.6rem] text-[1.25rem]">
        <Link
          to="/"
          className="font-medium italic text-name no-underline hover:underline"
        >
          Jacob Cheatley
        </Link>
        <span className="text-muted">/</span>
        {heading}
      </nav>
      {children}
    </main>
  );
}

export function BlogHeading() {
  return <h1 className="italic">Blog</h1>;
}

// Exact matching, so reading an Article does not mark the way back to the
// listing as the page the reader is on.
export function BlogHomeLink() {
  return (
    <Link
      to="/blog"
      activeOptions={{ exact: true }}
      className="italic no-underline hover:underline"
    >
      Blog
    </Link>
  );
}
