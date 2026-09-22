import bowlbyOneCss from "@fontsource/bowlby-one/index.css?url";
import bricolageGrotesqueCss from "@fontsource-variable/bricolage-grotesque/index.css?url";
import { createFileRoute } from "@tanstack/react-router";

const TITLE = "Elemental Showdown";
const DESCRIPTION =
  "Two elements, one winner. Drag the seam to cast your vote and settle which beats which.";

// The Project wears none of the Portfolio's shell, and this layout has no page
// of its own: it holds the head the voting screen and the Stats share, so the
// two webfonts are linked once and by no other page. Its children are the two
// URLs.
export const Route = createFileRoute("/elemental-showdown")({
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
});
