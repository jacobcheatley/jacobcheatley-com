import { useEffect, useState } from "react";
import { INK, PAPER } from "./element-colour";
import type { HeadlineKind, VoteReveal } from "./matchup-score";
import type { ShowdownElement } from "./schema";
import { SEAM_LANDINGS, seamAt, tabLabel } from "./tug";

// How long the reveal holds the screen on its own, which is what the draining
// bar drains over.
export const REVEAL_LINGER_MS = 3500;

// The bars growing out of their labels and the crowd line travelling to the
// mean, both in the Tug's own spring.
const SETTLE_MS = 700;

// Every label is one width, so every count bar starts at the same divider and
// its length is that value's share of the Votes and nothing else. The gap is
// the run a bar at 100% leaves at the far edge.
const LABEL_WIDTH_PX = 100;
const DIVIDER_WIDTH_PX = 1.5;
const EDGE_GAP_PX = 12;

const barWidth = (share: number) =>
  `calc(${LABEL_WIDTH_PX + DIVIDER_WIDTH_PX}px + ${share} * (100% - ${LABEL_WIDTH_PX + EDGE_GAP_PX}px))`;

// A percentage sits over the Element's colour when its bar is too short to
// hold it, so it is drawn in white cut out of ink.
const PERCENTAGE_OUTLINE = [
  "1.5px 0",
  "-1.5px 0",
  "0 1.5px",
  "0 -1.5px",
  "1px 1px",
  "-1px -1px",
  "1px -1px",
  "-1px 1px",
]
  .map((offset) => `${offset} ${INK}`)
  .join(", ");

const percent = (share: number) => `${Math.round(share * 100)}%`;

function headlineCopy(kind: HeadlineKind, voteCount: number) {
  switch (kind) {
    case "first":
      return "first to call it";
    case "early":
      return `early days, only ${voteCount} votes`;
    case "split":
      return "the crowd is split";
    case "with":
      return "with the crowd";
    case "close":
      return "close to the crowd";
    case "against":
      return "against the crowd";
  }
}

// The crowd's split on the Matchup just voted on, in the Tug's own place: the
// five tabs have become five count bars and the seam has not moved.
export function Reveal({
  reveal: { counts, vote, sameShare, headline, crowdMean },
  top,
  bottom,
  onAdvance,
}: {
  reveal: VoteReveal;
  top: ShowdownElement;
  bottom: ShowdownElement;
  onAdvance: () => void;
}) {
  const [hasSettled, setSettled] = useState(false);
  const voteCount = Object.values(counts).reduce(
    (total, forValue) => total + forValue,
    0,
  );

  // A frame at the tabs' own length, so the bars are seen growing out of them.
  useEffect(() => {
    const settling = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(settling);
  }, []);

  useEffect(() => {
    const advancing = setTimeout(onAdvance, REVEAL_LINGER_MS);
    return () => clearTimeout(advancing);
  }, [onAdvance]);

  return (
    <>
      {SEAM_LANDINGS.map((landing) => {
        const isOwn = landing === vote;
        const share = counts[landing] / voteCount;
        return (
          <span
            key={landing}
            className={`-translate-y-1/2 absolute inset-x-0 flex justify-end ${isOwn ? "z-20" : "z-10"}`}
            style={{ top: `${seamAt(landing)}%` }}
          >
            <span
              className="relative flex rounded-l-full font-bold text-[13px] leading-[26px] motion-safe:transition-[width] motion-safe:ease-spring"
              style={{
                background: INK,
                color: PAPER,
                boxShadow: `0 0 0 ${isOwn ? 3 : 1.5}px ${PAPER}`,
                opacity: isOwn ? 1 : 0.9,
                transitionDuration: `${SETTLE_MS}ms`,
                width: barWidth(hasSettled ? share : 0),
              }}
            >
              <span className="relative flex-1">
                <span
                  className="absolute right-[7px]"
                  style={{ textShadow: PERCENTAGE_OUTLINE }}
                >
                  {percent(share)}
                </span>
              </span>
              <span
                className="my-[5px] opacity-50"
                style={{ width: DIVIDER_WIDTH_PX, background: PAPER }}
              />
              <span className="pl-2" style={{ width: LABEL_WIDTH_PX }}>
                {tabLabel(landing, top, bottom)}
              </span>
              {isOwn && (
                <span
                  className="absolute top-[calc(100%+7px)] right-2 rounded-md px-2 text-[11px] leading-[18px]"
                  style={{ background: PAPER, color: INK }}
                >
                  ▲ your vote
                </span>
              )}
            </span>
          </span>
        );
      })}

      {crowdMean !== null && (
        <div
          className="-translate-y-1/2 absolute inset-x-0 z-10 h-1 motion-safe:transition-[top] motion-safe:ease-spring"
          style={{
            top: `${seamAt(hasSettled ? crowdMean : 0)}%`,
            transitionDuration: `${SETTLE_MS}ms`,
            background: `repeating-linear-gradient(90deg, ${PAPER} 0 10px, ${INK} 10px 20px)`,
          }}
        >
          <span
            className="-translate-y-1/2 absolute top-1/2 left-2 rounded-full px-2.5 py-0.5 font-bold text-[13px]"
            style={{ background: PAPER, color: INK }}
          >
            the crowd
          </span>
        </div>
      )}

      {/* The card takes the winner's side, below the link back to the
          Portfolio when that is the top one. */}
      <div
        className={`absolute inset-x-4 z-30 rounded-[14px] px-4 py-3 ${
          vote >= 0
            ? "top-[calc(max(0.75rem,env(safe-area-inset-top))+1.75rem)]"
            : "bottom-[max(0.875rem,env(safe-area-inset-bottom))]"
        }`}
        style={{ background: INK, color: PAPER }}
      >
        <p className="font-showdown-display text-[22px] leading-[1.05]">
          {headlineCopy(headline, voteCount)}
        </p>
        {crowdMean !== null && (
          <p className="text-[13px] opacity-80">
            {percent(sameShare)} voted the same, of {voteCount}
          </p>
        )}
        <div
          className="mt-1.5 h-1 origin-left rounded-sm"
          style={{
            background: PAPER,
            animation: `reveal-drain ${REVEAL_LINGER_MS}ms linear forwards`,
          }}
        />
      </div>
    </>
  );
}
