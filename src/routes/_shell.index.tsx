import { createFileRoute } from "@tanstack/react-router";
import { ProjectCard } from "@/portfolio/ProjectCard";

export const Route = createFileRoute("/_shell/")({ component: Home });

function Home() {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-5 gap-y-6">
      <ProjectCard
        to="/sticky-notes"
        title="Sticky Notes"
        description="Draw a note and pin it to the corkboard."
        tint="linear-gradient(135deg, #c99a5b, #b07f3f)"
        live
      />
    </ul>
  );
}
