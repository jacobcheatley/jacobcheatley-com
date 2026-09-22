import { createFileRoute } from "@tanstack/react-router";
import { ElementalShowdown } from "@/projects/elemental-showdown/ElementalShowdown";
import {
  castVoteFn,
  nextMatchupFn,
} from "@/projects/elemental-showdown/elemental-showdown.fn";

export const Route = createFileRoute("/elemental-showdown/")({
  loader: () => nextMatchupFn(),
  component: ElementalShowdownRoute,
});

function ElementalShowdownRoute() {
  return (
    <ElementalShowdown
      shown={Route.useLoaderData()}
      castVote={castVoteFn}
      nextMatchup={nextMatchupFn}
    />
  );
}
