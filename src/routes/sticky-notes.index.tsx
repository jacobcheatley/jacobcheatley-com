import { createFileRoute } from "@tanstack/react-router";

// `/sticky-notes`: the wall with the mat down. The wall itself is rendered by
// the layout route (which owns the loader and keeps it mounted under the mat),
// so this route exists only to name the URL that means "mat down".
export const Route = createFileRoute("/sticky-notes/")({
  component: () => null,
});
