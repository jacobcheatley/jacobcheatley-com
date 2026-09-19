import { Link, type LinkProps } from "@tanstack/react-router";

export type ProjectCardProps = {
  to: LinkProps["to"];
  title: string;
  description: string;
  /** Thumbnail fill: any CSS `background` value. */
  tint: string;
  live?: boolean;
};

export function ProjectCard({
  to,
  title,
  description,
  tint,
  live,
}: ProjectCardProps) {
  return (
    <li>
      <Link to={to} className="grid gap-[0.4rem] no-underline">
        <span
          className="relative mb-1 block aspect-[3/2] rounded-sm border border-line"
          style={{ background: tint }}
        >
          {live && (
            <span className="absolute top-2 left-2 rounded-sm bg-accent-2 px-2 py-1 font-sans text-xs font-semibold leading-none text-on-accent-2">
              Live
            </span>
          )}
        </span>
        <h2 className="font-serif text-[1.25rem]">{title}</h2>
        <p className="text-muted">{description}</p>
      </Link>
    </li>
  );
}
