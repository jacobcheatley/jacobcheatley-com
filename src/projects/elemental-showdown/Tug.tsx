import { useEffect, useRef, useState } from "react";
import { INK, PAPER, textOn } from "./element-colour";
import { Reveal } from "./Reveal";
import type { RateWindow, VoteValue } from "./showdown-schema";
import type { ShownElement } from "./showdown-stats";
import {
  draggedVote,
  SEAM_LANDINGS,
  STRONG_WIN,
  seamAt,
  steppedVote,
  tabLabel,
  voteSentence,
} from "./tug";
import type { VoteLimited, VoteReveal } from "./vote-reveal";

// Up and right take ground for the Element on top, the way a slider's keys
// read. A thumb does the opposite: it shoves the seam away from the Element it
// is voting for, so that the winner's side grows under it.
const ARROW_STEPS: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
};

// The emoji grows with the ground its Element holds.
const EMOJI_BASE_PX = 36;

const LIMITED_COPY = {
  minute: "slow down a sec",
  day: "that’s plenty for today, come back tomorrow",
} as const satisfies Record<RateWindow, string>;

// Dragging anywhere is the whole gesture, so the two Elements are the slider.
export function Tug({
  top,
  bottom,
  isFirstMatchup,
  onCast,
  limited,
  reveal,
  onAdvance,
}: {
  top: ShownElement;
  bottom: ShownElement;
  // The first Matchup of the visit is already on screen, so it does not slide
  // in, and it is the one that says how this works.
  isFirstMatchup: boolean;
  onCast: (value: VoteValue) => void;
  // The Vote the address had no room left for, each answer its own object so
  // that a second one in the same window springs the seam back too.
  limited: VoteLimited | null;
  // The crowd, once this Voter's own Vote is in it. Until then the Tug is the
  // whole screen and the crowd cannot sway them.
  reveal: VoteReveal | null;
  onAdvance: () => void;
}) {
  const [value, setValue] = useState<VoteValue>(0);
  const [isDragging, setDragging] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const seam = seamAt(value);
  const sentence = voteSentence(value, top, bottom);

  // A capped Vote took no ground, so the seam has nothing to rest on.
  useEffect(() => {
    if (limited) setValue(0);
  }, [limited]);

  // Revealed, the Tug has nothing left to drag and a touch anywhere is the
  // Voter asking for the next Matchup rather than waiting out the bar.
  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (reveal) {
      onAdvance();
      return;
    }
    dragFrom.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragTo(event: React.PointerEvent<HTMLDivElement>) {
    if (dragFrom.current === null) return;
    const dragged = draggedVote(event.clientY - dragFrom.current);
    if (dragged === value) return;
    navigator.vibrate?.(10 * Math.abs(dragged));
    setValue(dragged);
  }

  function letGo() {
    if (dragFrom.current === null) return;
    dragFrom.current = null;
    setDragging(false);
    // Let go back in the middle and nothing is cast: a stray drag is no Vote.
    if (value !== 0) onCast(value);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (reveal) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      onAdvance();
      return;
    }
    const step = ARROW_STEPS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      setValue(steppedVote(value, step));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onCast(value);
    }
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${top.name} against ${bottom.name}`}
      aria-orientation="vertical"
      aria-valuemin={-STRONG_WIN}
      aria-valuemax={STRONG_WIN}
      aria-valuenow={value}
      aria-valuetext={sentence}
      onPointerDown={startDrag}
      onPointerMove={dragTo}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      onKeyDown={onKeyDown}
      className={`absolute inset-0 touch-none overflow-hidden outline-none focus-visible:outline-[3px] focus-visible:outline-offset-[-6px] focus-visible:outline-white ${isFirstMatchup ? "" : "motion-safe:animate-matchup-slide-in"}`}
    >
      <Side element={top} topPercent={0} heightPercent={seam} />
      <Side element={bottom} topPercent={seam} heightPercent={100 - seam} />

      {reveal ? (
        <Reveal
          reveal={reveal}
          top={top}
          bottom={bottom}
          onAdvance={onAdvance}
        />
      ) : (
        <>
          {SEAM_LANDINGS.map((landing) => (
            <span
              key={landing}
              className={`-translate-y-1/2 absolute right-0 z-10 rounded-l-full py-px pl-2.5 font-bold text-[11px] transition-[opacity,padding] duration-200 ${
                landing === value
                  ? "pr-5 opacity-100"
                  : `pr-2 ${isDragging ? "opacity-70" : "opacity-35"}`
              }`}
              style={{
                top: `${seamAt(landing)}%`,
                background: INK,
                color: PAPER,
              }}
            >
              {tabLabel(landing, top, bottom)}
            </span>
          ))}

          <button
            type="button"
            // The slider takes the keyboard for both of them: Enter on it casts
            // whatever the pill reads.
            tabIndex={-1}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onCast(value)}
            className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 z-20 whitespace-nowrap rounded-full px-5 py-[11px] font-showdown-display transition-[top] duration-300 ease-spring"
            style={{
              top: `${seam}%`,
              background: INK,
              color: PAPER,
              fontSize: Math.abs(value) === STRONG_WIN ? 19 : 15,
            }}
          >
            {sentence}
          </button>
        </>
      )}

      {isFirstMatchup && !reveal && !limited && (
        <p
          className="pointer-events-none absolute inset-x-0 z-20 text-center text-[13px] opacity-75"
          style={{ top: "calc(50% + 30px)", color: textOn(bottom.colour) }}
        >
          drag up or down: the winner takes ground
        </p>
      )}

      {limited && (
        <p
          className="pointer-events-none absolute inset-x-0 z-20 px-8 text-center font-showdown-display text-[17px] leading-[1.2]"
          style={{ top: "calc(50% + 30px)", color: textOn(bottom.colour) }}
        >
          {LIMITED_COPY[limited.window]}
        </p>
      )}
    </div>
  );
}

function Side({
  element,
  topPercent,
  heightPercent,
}: {
  element: ShownElement;
  topPercent: number;
  heightPercent: number;
}) {
  return (
    <div
      className="absolute inset-x-0 flex flex-col items-center justify-center gap-2 overflow-hidden transition-[top,height] duration-300 ease-spring"
      style={{
        top: `${topPercent}%`,
        height: `${heightPercent}%`,
        background: element.colour,
        color: textOn(element.colour),
      }}
    >
      <span
        className="leading-none transition-[font-size] duration-300 ease-spring"
        style={{ fontSize: EMOJI_BASE_PX + heightPercent }}
      >
        {element.emoji}
      </span>
      <span className="font-showdown-display text-[30px] leading-[1.05]">
        {element.name}
      </span>
    </div>
  );
}
