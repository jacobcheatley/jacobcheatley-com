import bowlbyOneCss from "@fontsource/bowlby-one/index.css?url";
import bricolageGrotesqueCss from "@fontsource-variable/bricolage-grotesque/index.css?url";
import { createFileRoute } from "@tanstack/react-router";
import { ElementalShowdown } from "@/projects/elemental-showdown/ElementalShowdown";
import {
  castVoteFn,
  nextMatchupFn,
} from "@/projects/elemental-showdown/elemental-showdown.fn";

const TITLE = "Elemental Showdown";
const DESCRIPTION =
  "Two elements, one winner. Drag the seam to cast your vote and settle which beats which.";

// The Project wears none of the Portfolio's shell, and its two webfonts are
// linked here so no other page loads them.
export const Route = createFileRoute("/elemental-showdown")({
  loader: () => nextMatchupFn(),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [
      { rel: "stylesheet", href: bowlbyOneCss },
      { rel: "stylesheet", href: bricolageGrotesqueCss },
    ],
  }),
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
