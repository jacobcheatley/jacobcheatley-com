import { Link } from "@tanstack/react-router";
import { type CSSProperties, lazy, Suspense, useEffect, useState } from "react";

// The cutting mat: a full-viewport surface that slides up over the cork wall and
// back down (#69). The route IS its state — `/sticky-notes/new` means up — so
// the wall never unmounts; the mat just covers it.
//
// This module is the mat *surface* only, and it SSRs: a direct load of
// /sticky-notes/new paints the mat already in place. Everything that lives ON
// the mat (pads, note, strip, bin) is the StickyEditor island, code-split so the
// wall costs no editor JS, fetched the first time the mat comes up and kept
// mounted after that so a half-built note survives mat-down.
const StickyEditor = lazy(() => import("./StickyEditor"));

const SLIDE_MS = 500;
// The prototype's ease-out (#70): quick off the mark, long settle.
const EASE_OUT = "cubic-bezier(.2,.8,.25,1)";

// Cool slate cutting mat (spec #49): grid rules over a dark wash, distinct from
// the wall's warm cork. Exported so anything else that needs the desk ground
// (a future drawer, the pinning phase) uses the one definition.
export const DESK_BG: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 26px)",
    "radial-gradient(120% 120% at 50% 0%, #2a2f36, #171a1f)",
  ].join(", "),
  backgroundSize: "26px 26px, 26px 26px, cover",
};

// A strip of masking tape stuck to the mat — the label style for the mat's own
// controls (the pinning phase adds its own in T7).
const TAPE: CSSProperties = {
  backgroundColor: "#e8dcae",
  backgroundImage: [
    "linear-gradient(180deg, rgba(255,255,255,.45), rgba(0,0,0,.06))",
    "repeating-linear-gradient(90deg, rgba(160,140,90,.10) 0 3px, transparent 3px 7px)",
  ].join(", "),
  boxShadow: "0 2px 5px rgba(0,0,0,.4)",
  clipPath: "polygon(3% 0, 97% 2%, 100% 96%, 96% 100%, 4% 98%, 0 4%)",
  transform: "rotate(-2.2deg)",
};

export function StickyMat({ up }: { up: boolean }) {
  // Latch: once the mat has been up, the island stays mounted under it.
  // A direct /sticky-notes/new load starts latched, so the island SSRs too.
  const [everUp, setEverUp] = useState(up);
  // The first paint must not animate — a direct load arrives with the mat
  // already up, and hydration must not replay the slide.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (up) setEverUp(true);
  }, [up]);

  useEffect(() => setArmed(true), []);

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
      // Down means off-screen: keep its link and objects out of the wall's
      // tab order and screen-reader tree until it is actually up.
      inert={!up}
      className="fixed inset-0 z-40 overflow-hidden border-slate-300/20 border-t-2 text-slate-100"
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
          <StickyEditor />
        </Suspense>
      )}
    </div>
  );
}
