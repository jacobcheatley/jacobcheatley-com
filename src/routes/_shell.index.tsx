import { createFileRoute } from "@tanstack/react-router";
import { ProjectCard } from "@/portfolio/ProjectCard";

export const Route = createFileRoute("/_shell/")({ component: Home });

function Home() {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-5 gap-y-6">
      <ProjectCard
        to="/guestbook"
        title="Guestbook"
        description="Leave a note for the next visitor."
        tint="color-mix(in oklab, var(--color-accent) 22%, var(--color-surface))"
        live
      />
    </ul>
  );
}
