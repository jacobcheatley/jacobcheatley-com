import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { DESK_BG, EASE_OUT, SLIDE_MS, TAPE } from "./desk";
import type { NoteContent } from "./note-schema";

// Everything that lives on the mat is code-split off it, so the wall costs no
// editor JS, and stays mounted once fetched so a half-built note survives the
// mat going down.
const StickyEditor = lazy(() => import("./StickyEditor"));

export function StickyMat({
  up,
  pinning,
  onPinning,
}: {
  up: boolean;
  // The note that has left the mat for the Spotlight over the wall. The page
  // owns this, because it is the page that takes the mat down.
  pinning?: NoteContent;
  onPinning?: (note: NoteContent | undefined) => void;
}) {
  // Latch: once the mat has been up, the island stays mounted under it.
  // A direct /sticky-notes/new load starts latched, so the island SSRs too.
  const [everUp, setEverUp] = useState(up);
  // The first paint must not animate — a direct load arrives with the mat
  // already up, and hydration must not replay the slide.
  const [armed, setArmed] = useState(false);
  // Down-slide only: the mat may not go inert while it is still on screen, or
  // the slide is cut off mid-flight. Starts settled — the first paint of either
  // route is already where it belongs.
  const [settled, setSettled] = useState(true);

  useEffect(() => {
    if (up) setEverUp(true);
  }, [up]);

  useEffect(() => setArmed(true), []);

  useEffect(() => {
    // Up is interactive at once; down waits out the slide. The timer is the
    // fallback for the transitionend below, which never fires under
    // prefers-reduced-motion.
    if (up) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [up]);

  // The wall is still there under the mat; don't let it scroll behind it.
  useEffect(() => {
    if (!up) return;
    const { style } = document.documentElement;
    const previous = style.overflow;
    style.overflow = "hidden";
    return () => {
      style.overflow = previous;
    };
  }, [up]);

  return (
    <div
      // Down and parked means off-screen: keep its link and objects out of the
      // wall's tab order and screen-reader tree.
      inert={!up && settled}
      onTransitionEnd={() => {
        if (!up) setSettled(true);
      }}
      // The `!` beats the inline transition below, which a class cannot.
      className="motion-reduce:transition-none! fixed inset-0 z-40 overflow-hidden border-slate-300/20 border-t-2 text-slate-100"
      style={{
        ...DESK_BG,
        transform: up ? "translateY(0)" : "translateY(100%)",
        transition: armed ? `transform ${SLIDE_MS}ms ${EASE_OUT}` : "none",
        boxShadow: "0 -14px 34px rgba(0,0,0,.55)",
      }}
    >
      <Link
        to="/sticky-notes"
        className="absolute top-3 left-3 z-40 px-4 py-2 font-sans text-[0.9375rem] no-underline"
        style={{ ...TAPE, color: "#4a412c" }}
      >
        ← the wall
      </Link>

      {everUp && (
        <Suspense fallback={null}>
          <StickyEditor up={up} pinning={pinning} onPinning={onPinning} />
        </Suspense>
      )}
    </div>
  );
}
