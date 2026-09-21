import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { INK, PAPER } from "./element-colour";

// The filled button a screen of the Project carries its one main action on,
// beside the outlined ShareButton.
export function PrimaryLink({
  to,
  children,
}: {
  to: LinkProps["to"];
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="grid h-14 place-items-center rounded-[14px] font-showdown-display text-[20px] no-underline"
      style={{ background: PAPER, color: INK }}
    >
      {children}
    </Link>
  );
}
