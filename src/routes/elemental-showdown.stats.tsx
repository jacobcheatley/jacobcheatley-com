import { createFileRoute } from "@tanstack/react-router";
import { showdownStatsFn } from "@/projects/elemental-showdown/elemental-showdown.fn";
import { Stats } from "@/projects/elemental-showdown/Stats";

export const Route = createFileRoute("/elemental-showdown/stats")({
  loader: () => showdownStatsFn(),
  component: StatsRoute,
});

function StatsRoute() {
  return <Stats stats={Route.useLoaderData()} />;
}
