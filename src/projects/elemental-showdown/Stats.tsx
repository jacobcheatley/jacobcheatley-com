import { useRef, useState } from "react";
import { INK, NO_ELEMENT, PAPER, textOn } from "./element-colour";
import { elementPageOf } from "./element-page";
import type { Confidence } from "./matchup-score";
import { PrimaryLink } from "./PrimaryLink";
import { ShareButton } from "./ShareButton";
import { Stories } from "./Stories";
import {
  type CrowdCalls,
  EVERY_VOTES_TO_UNLOCK,
  type LockedStats,
  OWN_VOTES_TO_UNLOCK,
  type ShowdownStats,
  type StatsElement,
  type UnlockedStats,
} from "./showdown-stats";

// The colour a meter turns once it is met.
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
        <OpenStats stats={stats} />
      )}
    </main>
  );
}

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
      <PrimaryLink to="/elemental-showdown">keep voting</PrimaryLink>
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
          style={{ background: NO_ELEMENT }}
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

// The rail is longer than the screen, so whichever way an Element was picked,
// its tile comes back under the Voter's thumb as it becomes the current one.
const centreInRail = (tile: HTMLButtonElement | null) =>
  tile?.scrollIntoView({ inline: "center", block: "nearest" });

// The Stats open: the Stories, a page per Element, then the foot. Each section
// stands on its own down the screen.
function OpenStats({ stats }: { stats: UnlockedStats }) {
  const railed = [...stats.elements].sort((one, other) =>
    one.name.localeCompare(other.name),
  );
  const [chosenId, setChosenId] = useState<number | null>(null);
  const everyElement = useRef<HTMLElement>(null);
  // Until the Voter picks one, the rail's first Element is the page they read.
  const chosen = railed.find((element) => element.id === chosenId) ?? railed[0];

  // A chip sits deep in a page, so picking one puts the rail back under the
  // Voter's thumb rather than dropping them into the middle of the next page.
  function choose(elementId: number) {
    setChosenId(elementId);
    everyElement.current?.scrollIntoView();
  }

  return (
    <>
      <Stories stories={stats.stories} />
      {chosen ? (
        <section ref={everyElement}>
          <h2 className="px-4 pt-6 pb-1 font-showdown-display text-[28px]">
            every element
          </h2>
          <nav
            className="sticky top-0 z-10 flex gap-1 overflow-x-auto p-2 [scrollbar-width:none]"
            style={{ background: INK }}
          >
            {railed.map((element) => (
              <button
                key={element.id}
                ref={element.id === chosen.id ? centreInRail : null}
                type="button"
                aria-label={element.name}
                aria-current={element.id === chosen.id}
                onClick={() => choose(element.id)}
                className="size-[42px] flex-none rounded-xl text-[22px]"
                style={{
                  background: element.colour,
                  color: textOn(element.colour),
                  boxShadow:
                    element.id === chosen.id ? `0 0 0 3px ${PAPER}` : undefined,
                }}
              >
                {element.emoji}
              </button>
            ))}
          </nav>
          <ElementPage element={chosen} calls={stats} onChoose={choose} />
        </section>
      ) : null}
      <div className="grid gap-[10px] px-4 pt-[22px] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <p>More Votes make every call surer.</p>
        <PrimaryLink to="/elemental-showdown">keep voting</PrimaryLink>
        <ShareButton label="send it to a friend" />
      </div>
    </>
  );
}

// The outline is the Confidence. The two thinner ones carry the heavy one's
// width as a margin, so every chip takes up the same room whatever the crowd
// knows.
const CHIP_OUTLINE: Record<Confidence, string> = {
  solid: "border-[3px]",
  medium: "m-[1.5px] border-[1.5px]",
  faint: "m-[1.5px] border-[1.5px] border-dashed opacity-55",
};

// One Element's whole standing, full-bleed in its colour: who it beats, who
// beats it, and how sure the crowd is of each.
function ElementPage({
  element,
  calls,
  onChoose,
}: {
  element: StatsElement;
  calls: CrowdCalls;
  onChoose: (elementId: number) => void;
}) {
  const {
    winCount,
    lossCount,
    nemesis,
    favouriteVictim,
    bands,
    notYetJudgedCount,
  } = elementPageOf(calls, element);
  return (
    <article
      className="grid content-start gap-[18px] px-4 pt-[22px] pb-10"
      style={{ background: element.colour, color: textOn(element.colour) }}
    >
      <div className="flex items-center gap-[14px]">
        <span className="text-[72px] leading-none">{element.emoji}</span>
        <h1 className="font-showdown-display text-[44px] leading-[1.05]">
          {element.name}
        </h1>
      </div>
      <p className="font-bold text-[14px]">
        wins {winCount}, loses {lossCount}.
        {nemesis ? ` Nemesis: ${nemesis.emoji} ${nemesis.name}.` : ""}
        {favouriteVictim
          ? ` Favourite victim: ${favouriteVictim.emoji} ${favouriteVictim.name}.`
          : ""}
      </p>
      {bands.map(({ effectiveness, verb, opponents }) => (
        <section key={effectiveness}>
          <h2 className="mb-2 font-showdown-display text-[24px]">
            {verb}{" "}
            <small className="font-showdown font-bold text-[13px] opacity-70">
              {effectiveness}
            </small>
          </h2>
          <div className="flex flex-wrap gap-[6px]">
            {opponents.map(({ opponent, confidence }) => (
              <button
                key={opponent.id}
                type="button"
                onClick={() => onChoose(opponent.id)}
                className={`rounded-full py-[5px] pr-[11px] pl-2 font-bold text-[14px] ${CHIP_OUTLINE[confidence]}`}
                style={{
                  background: opponent.colour,
                  color: textOn(opponent.colour),
                }}
              >
                {opponent.emoji} {opponent.name}
              </button>
            ))}
          </div>
        </section>
      ))}
      {notYetJudgedCount > 0 ? <p>{notYetJudgedCount} not yet judged</p> : null}
      <p className="text-[12px] opacity-75">
        Heavy outline: the crowd is sure. Thin: fairly sure. Dashed: a guess
        from a few Votes.
      </p>
    </article>
  );
}
