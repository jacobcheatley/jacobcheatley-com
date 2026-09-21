import { Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { INK, PAPER, textOn } from "./element-colour";
import type { VoteCastResult, VoteLimited, VoteReveal } from "./matchup-score";
import type { NextMatchup } from "./matchup-selection";
import { PrimaryLink } from "./PrimaryLink";
import { ShareButton } from "./ShareButton";
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
  castVote: (options: { data: VoteCast }) => Promise<VoteCastResult>;
  nextMatchup: () => Promise<NextMatchup>;
}) {
  const [matchup, setMatchup] = useState(shown);
  const [reveal, setReveal] = useState<VoteReveal | null>(null);
  const [limited, setLimited] = useState<VoteLimited | null>(null);
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
      .then((cast) => {
        // A capped Vote was never stored, so there is no crowd to reveal and
        // no next Matchup to draw: this one stays up for the Voter to retry.
        if (cast.state === "limited") {
          setLimited(cast);
          return;
        }
        setLimited(null);
        setReveal(cast);
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
        <>
          <Tug
            key={`${matchup.top.id}:${matchup.bottom.id}`}
            top={matchup.top}
            bottom={matchup.bottom}
            isFirstMatchup={votesCast === 0}
            onCast={cast}
            limited={limited}
            reveal={reveal}
            onAdvance={advance}
          />
          {/* The Stats have a screen of their own; the Matchup keeps its
              corner link to them, in the top Element's own ink. */}
          <Link
            to="/elemental-showdown/stats"
            className={`${CORNER_LINK} right-0 text-right`}
            style={{ color: textOn(matchup.top.colour) }}
          >
            the stats
          </Link>
        </>
      ) : (
        <AllJudged matchupCount={matchup.matchupCount} />
      )}
      <Link
        to="/"
        className={`${CORNER_LINK} left-0`}
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

const CORNER_LINK =
  "absolute top-0 z-30 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-[13px] no-underline opacity-75 hover:underline";

function AllJudged({ matchupCount }: { matchupCount: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 px-8 text-center">
      <p className="font-showdown-display text-[30px] leading-[1.05]">
        you’ve judged all {matchupCount} matchups
      </p>
      <div className="grid w-full max-w-[22rem] gap-3">
        <PrimaryLink to="/elemental-showdown/stats">the stats</PrimaryLink>
        <ShareButton label="send it to a friend" />
      </div>
    </div>
  );
}
