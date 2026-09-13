import { createFileRoute } from "@tanstack/react-router";

// `/sticky-notes/new`: the same page with the cutting mat slid up over the wall.
// The layout route renders the mat and derives its state from this route
// matching, so there is nothing to render here — the URL is the whole point.
export const Route = createFileRoute("/sticky-notes/new")({
  component: () => null,
});
