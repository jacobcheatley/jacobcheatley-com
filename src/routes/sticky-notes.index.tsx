import { createFileRoute } from "@tanstack/react-router";

// The layout route renders the wall and owns the loader, so this route exists
// only to name the URL that means "mat down".
export const Route = createFileRoute("/sticky-notes/")({
  component: () => null,
});
