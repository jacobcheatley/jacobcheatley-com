import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactElement } from "react";

type ProjectLinkProps = {
  to: LinkProps["to"];
  title: string;
  cover: ReactElement;
};

export function ProjectLink({ to, title, cover }: ProjectLinkProps) {
  return (
    <li>
      <Link
        to={to}
        aria-label={title}
        className="group relative block aspect-[3/2]"
      >
        {/* Absolute, so a Cover's percentage heights resolve against the frame.
            The lift is on this box, not the link: a hit area that moved from
            under the pointer would flicker at its bottom edge. */}
        <div className="absolute inset-0 overflow-hidden rounded-sm border border-line transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-focus-visible:-translate-y-0.5 group-focus-visible:shadow-lg motion-reduce:transform-none motion-reduce:transition-none">
          {cover}
        </div>
      </Link>
    </li>
  );
}
