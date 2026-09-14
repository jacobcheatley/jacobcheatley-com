import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_shell/")({ component: Home });

function Home() {
  // The guestbook card is gone; the Sticky Notes wall card returns with the
  // wall route (#60). No live Project until then.
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-5 gap-y-6" />
  );
}
