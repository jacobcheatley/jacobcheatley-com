import { useEffect, useState } from "react";
import { INK, NO_ELEMENT, PAPER } from "./element-colour";
import type { StatsElement } from "./showdown-stats";

// The whole moment: the wave crossing the mosaic, the stamp landing under it,
// and a beat to read it before the Stats take the screen.
export const UNLOCK_MS = 2600;

// How long one tile takes to flip, and how far behind the tile before it on
// the wave it starts.
const TILE_FLIP_MS = 350;
const WAVE_STEP_MS = 28;

// The stamp lands while the wave is still crossing.
const STAMP_DELAY_MS = 700;
const STAMP_MS = 450;

// Two short buzzes and a long one.
const UNLOCK_BUZZ = [30, 60, 120];

// The stamp stays one line whatever it lands on: Bowlby One sets these two
// words about nine times the font size wide, and the tilt and the outline add
// to that, so on a phone the size comes from the screen and 44px is the
// ceiling it is drawn at.
const STAMP_FONT_SIZE = "min(44px, 8vw)";

// The mosaic is this many tiles wide, so a tile's place gives its row and its
// column. The wave runs down the diagonal, a row counting for two columns so
// that it leans rather than falling at 45°.
const MOSAIC_COLUMNS = 13;
const waveStepsTo = (place: number) =>
  (place % MOSAIC_COLUMNS) + Math.floor(place / MOSAIC_COLUMNS) * 2;

// The Stats opening on the screen the Vote that opened them was cast on: the
// locked screen's blank mosaic, a tile per Active Element, flips to its own
// Element in a diagonal wave, and the stamp lands under it.
export function UnlockMoment({
  elements,
  onDone,
}: {
  elements: StatsElement[];
  onDone: () => void;
}) {
  const [hasFlipped, setFlipped] = useState(false);

  // A frame on the blank mosaic, so the wave is seen crossing it rather than
  // having already crossed.
  useEffect(() => {
    const flipping = requestAnimationFrame(() => setFlipped(true));
    return () => cancelAnimationFrame(flipping);
  }, []);

  useEffect(() => {
    navigator.vibrate?.(UNLOCK_BUZZ);
    const opening = setTimeout(onDone, UNLOCK_MS);
    return () => clearTimeout(opening);
  }, [onDone]);

  return (
    <main
      className="grid h-dvh content-center gap-16 overflow-hidden px-4 font-showdown"
      style={{ background: INK, color: PAPER }}
    >
      <div aria-hidden className="grid grid-cols-13 gap-[3px]">
        {elements.map((element, place) => {
          const flipDelay = `${waveStepsTo(place) * WAVE_STEP_MS}ms`;
          return (
            <span
              key={element.id}
              className="grid aspect-square place-items-center rounded-md text-[15px] leading-none transition-[background-color,scale] ease-spring"
              style={{
                transitionDuration: `${TILE_FLIP_MS}ms`,
                transitionDelay: flipDelay,
                background: hasFlipped ? element.colour : NO_ELEMENT,
                scale: hasFlipped ? "1.08" : "1",
              }}
            >
              <span
                className="transition-opacity"
                style={{
                  transitionDuration: `${TILE_FLIP_MS}ms`,
                  transitionDelay: flipDelay,
                  opacity: hasFlipped ? 1 : 0,
                }}
              >
                {element.emoji}
              </span>
            </span>
          );
        })}
      </div>
      <p
        className="mx-auto w-fit whitespace-nowrap rounded-2xl px-[22px] py-[10px] font-showdown-display"
        style={{
          fontSize: STAMP_FONT_SIZE,
          rotate: "-7deg",
          background: PAPER,
          color: INK,
          boxShadow: `0 0 0 5px ${INK}, 0 0 0 9px ${PAPER}`,
          animation: `stats-unlocked-stamp ${STAMP_MS}ms ${STAMP_DELAY_MS}ms var(--ease-spring) both`,
        }}
      >
        stats unlocked
      </p>
    </main>
  );
}
