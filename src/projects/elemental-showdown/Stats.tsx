import { Link } from "@tanstack/react-router";
import { INK, PAPER } from "./element-colour";
import { ShareButton } from "./ShareButton";
import {
  EVERY_VOTES_TO_UNLOCK,
  type LockedStats,
  OWN_VOTES_TO_UNLOCK,
  type ShowdownStats,
} from "./showdown-stats";

// A tile of the mosaic before its Element is behind it, and the one colour in
// the Project that belongs to no Element: a meter turns it once it is met.
const BLANK_TILE = "#2c2825";
const MET = "#9fe870";

// The Stats in the Project's own full-height layout rather than the Portfolio's
// shell, scrolling where the voting screen does not.
export function Stats({ stats }: { stats: ShowdownStats }) {
  return (
    <main
      className="min-h-dvh font-showdown text-[15px] leading-[1.35]"
      style={{ background: INK, color: PAPER }}
    >
      {stats.state === "locked" ? (
        <LockedScreen {...stats} />
      ) : (
        <p className="p-4">the stats are open</p>
      )}
    </main>
  );
}

// Placeholder copy, as the prototype wrote it: the owner writes the real words.
const stillMissing = (ownVoteCount: number) =>
  ownVoteCount < OWN_VOTES_TO_UNLOCK
    ? `${OWN_VOTES_TO_UNLOCK - ownVoteCount} more from you and it opens.`
    : "You have done your part. It opens when the crowd catches up.";

function LockedScreen({
  ownVoteCount,
  everyVoteCount,
  elementCount,
}: LockedStats) {
  return (
    <div className="grid gap-[18px] px-4 pt-[max(1.375rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <h1 className="font-showdown-display text-[40px] leading-[1.05]">
        the stats are locked
      </h1>
      <Mosaic tileCount={elementCount} />
      <Meter
        label="your Votes"
        count={ownVoteCount}
        goal={OWN_VOTES_TO_UNLOCK}
      />
      <Meter
        label="everyone’s Votes"
        count={everyVoteCount}
        goal={EVERY_VOTES_TO_UNLOCK}
      />
      <p>{stillMissing(ownVoteCount)}</p>
      <Link
        to="/elemental-showdown"
        className="grid h-14 place-items-center rounded-[14px] font-showdown-display text-[20px] no-underline"
        style={{ background: PAPER, color: INK }}
      >
        keep voting
      </Link>
      <ShareButton
        label={
          everyVoteCount < EVERY_VOTES_TO_UNLOCK
            ? "bring a friend, fill the bar"
            : "send it to a friend"
        }
      />
    </div>
  );
}

// One blank tile per Active Element, and nothing about which Element: the
// Stats' shape is all a locked screen is allowed to show.
function Mosaic({ tileCount }: { tileCount: number }) {
  // Blank tiles differ in nothing, so a tile's place in the mosaic is the only
  // identity it has.
  const places = Array.from({ length: tileCount }, (_, at) => at);
  return (
    <div aria-hidden className="grid grid-cols-13 gap-[3px]">
      {places.map((place) => (
        <span
          key={place}
          className="aspect-square rounded-md"
          style={{ background: BLANK_TILE }}
        />
      ))}
    </div>
  );
}

// The bar is the label drawn: a Voter past the number reads it as met rather
// than as a bar running off the end.
function Meter({
  label,
  count,
  goal,
}: {
  label: string;
  count: number;
  goal: number;
}) {
  const reached = Math.min(count, goal);
  return (
    <div className="grid gap-1">
      <b>
        {label}: {reached} of {goal}
      </b>
      <div
        className="h-[26px] overflow-hidden rounded-full"
        style={{ boxShadow: `inset 0 0 0 2px ${PAPER}` }}
      >
        <div
          className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-spring"
          style={{
            width: `${(reached / goal) * 100}%`,
            background: reached === goal ? MET : PAPER,
          }}
        />
      </div>
    </div>
  );
}
