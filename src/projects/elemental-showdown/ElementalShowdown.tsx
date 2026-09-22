import { Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { INK, PAPER, textOn } from "./element-colour";
import type { VoteReveal } from "./matchup-score";
import type { NextMatchup } from "./matchup-selection";
import type { VoteCast, VoteValue } from "./showdown-schema";
import { Tug } from "./Tug";

// The whole screen: one Matchup at a time, in the Project's own full-height
// layout rather than the Portfolio's shell.
export function ElementalShowdown({
  shown,
  castVote,
  nextMatchup,
}: {
  shown: NextMatchup;
  castVote: (options: { data: VoteCast }) => Promise<VoteReveal>;
  nextMatchup: () => Promise<NextMatchup>;
}) {
  const [matchup, setMatchup] = useState(shown);
  const [reveal, setReveal] = useState<VoteReveal | null>(null);
  const [votesCast, setVotesCast] = useState(0);
  // A ref for the guard: a second Enter can arrive before a re-render would
  // have told it the first Vote is already on its way.
  const casting = useRef(false);
  // Drawn while the Voter reads the reveal, so the next Matchup is there the
  // moment they are done with this one.
  const drawing = useRef<Promise<NextMatchup> | null>(null);

  function cast(value: VoteValue) {
    if (matchup.state !== "matchup" || casting.current) return;
    casting.current = true;
    const { top, bottom } = matchup;
    castVote({
      data: { topElementId: top.id, bottomElementId: bottom.id, value },
    })
      .then((crowd) => {
        setReveal(crowd);
        drawing.current = nextMatchup();
      })
      .catch((cause: unknown) => {
        // Nothing was stored, so the Matchup stays up and the next drag is
        // simply the Vote again.
        console.error(new Error("casting the Vote failed", { cause }));
      })
      .finally(() => {
        casting.current = false;
      });
  }

  // The reveal's own clock calls this, and so does a Voter who has read enough.
  const advance = useCallback(() => {
    const drawn = drawing.current;
    if (!drawn) return;
    drawing.current = null;
    drawn
      .then((next) => {
        setMatchup(next);
        setReveal(null);
        setVotesCast((count) => count + 1);
      })
      .catch((cause: unknown) => {
        // The reveal stays up rather than an empty screen taking its place.
        console.error(new Error("drawing the next Matchup failed", { cause }));
      });
  }, []);

  return (
    <main
      className="relative h-dvh select-none overflow-hidden font-showdown text-[15px] leading-[1.35]"
      style={{ background: INK, color: PAPER }}
    >
      {matchup.state === "matchup" ? (
        <Tug
          key={`${matchup.top.id}:${matchup.bottom.id}`}
          top={matchup.top}
          bottom={matchup.bottom}
          isFirstMatchup={votesCast === 0}
          onCast={cast}
          reveal={reveal}
          onAdvance={advance}
        />
      ) : (
        <AllJudged matchupCount={matchup.matchupCount} />
      )}
      <Link
        to="/"
        className="absolute top-0 left-0 z-30 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-[13px] no-underline opacity-75 hover:underline"
        style={{
          color:
            matchup.state === "matchup" ? textOn(matchup.top.colour) : PAPER,
        }}
      >
        Jacob Cheatley
      </Link>
    </main>
  );
}

function AllJudged({ matchupCount }: { matchupCount: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <p className="font-showdown-display text-[30px] leading-[1.05]">
        you’ve judged all {matchupCount} matchups
      </p>
    </div>
  );
}
