import { createFileRoute, Outlet } from "@tanstack/react-router";

// Passthrough layout for the Sticky Notes routes so the wall (`/sticky-notes`,
// the index) and the editor (`/sticky-notes/new`) are full-bleed siblings — it
// adds no chrome of its own, unlike `_shell` which frames the Portfolio column.
export const Route = createFileRoute("/sticky-notes")({
  component: Outlet,
});
