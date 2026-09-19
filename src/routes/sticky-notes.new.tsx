import { createFileRoute } from "@tanstack/react-router";

// The layout route renders the mat and derives its state from this route
// matching, so there is nothing to render here.
export const Route = createFileRoute("/sticky-notes/new")({
  component: () => null,
});
