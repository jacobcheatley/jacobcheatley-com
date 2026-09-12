import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DESK_BG, StickyEditor } from "@/projects/sticky-notes/StickyEditor";

// The editor (`/sticky-notes/new`): a full-screen, client-only island. It seeds
// a note with Math.random and touches localStorage / pointer APIs, so it must
// mount only in the browser — gate on `mounted` so SSR and the first client
// render match (a bare desk) and the editor swaps in after hydration.
export const Route = createFileRoute("/sticky-notes/new")({
  component: NewNote,
});

function NewNote() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Same desk ground as the mounted editor, so hydration doesn't flash.
  if (!mounted) return <div className="min-h-dvh" style={DESK_BG} />;
  return <StickyEditor />;
}
