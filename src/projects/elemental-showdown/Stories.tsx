import { INK, NO_ELEMENT, PAPER } from "./element-colour";
import type { HottestTake, Story } from "./showdown-stories";

// The crowd's calls as headlines: a row that scrolls sideways with the next
// Story peeking, each a full-bleed field in its Element's colour under an ink
// card. All the copy here is the prototype's placeholder: the owner writes the
// real words.

// The diagonal a Matchup's two colours and a triangle's three are split on.
const FIELD_ANGLE = "115deg";

// One colour is the same gradient with one stop, so the field needs no branch.
const fieldOf = (colours: string[]) =>
  `linear-gradient(${FIELD_ANGLE}, ${colours
    .map(
      (colour, at) =>
        `${colour} ${(100 * at) / colours.length}% ${
          (100 * (at + 1)) / colours.length
        }%`,
    )
    .join(", ")})`;

export function Stories({ stories }: { stories: Story[] }) {
  return (
    <div className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
      {stories.length === 0 ? (
        <Field
          colours={[NO_ELEMENT]}
          emojis="🤷"
          kicker="the crowd"
          headline="too early to call"
          sub="Keep voting: nothing is settled yet."
        />
      ) : (
        stories.map((story) => <StoryCard key={story.kind} story={story} />)
      )}
    </div>
  );
}

function Field({
  colours,
  emojis,
  kicker,
  headline,
  sub,
}: {
  colours: string[];
  emojis: string;
  kicker: string;
  headline: string;
  sub: string;
}) {
  return (
    <section
      className="grid min-h-[320px] flex-[0_0_88%] snap-start content-end gap-[10px] px-4 py-[18px]"
      style={{ background: fieldOf(colours) }}
    >
      <p className="text-[70px] leading-none tracking-[6px] [text-shadow:0_3px_0_rgb(0_0_0/0.25)]">
        {emojis}
      </p>
      <div
        className="rounded-[14px] px-4 py-3"
        style={{ background: INK, color: PAPER }}
      >
        <p className="font-bold text-[13px] opacity-70">{kicker}</p>
        <p className="font-showdown-display text-[22px]">{headline}</p>
        <p className="text-[13px] opacity-80">{sub}</p>
      </div>
    </section>
  );
}

// The Element the Voter backed against the one they put it over, in the words
// an Element's page uses for the same three calls.
const TAKE_VERB = { 0: "is even with", 1: "beats", 2: "crushes" } as const;

const takeLine = ({ elements: [backed, over], vote }: HottestTake) =>
  `Your hottest take: ${backed.emoji} ${backed.name} ${TAKE_VERB[vote]} ${over.emoji} ${over.name}. The crowd is not so sure.`;

const percent = (share: number) => `${Math.round(share * 100)}%`;

function StoryCard({ story }: { story: Story }) {
  switch (story.kind) {
    case "champion":
      return (
        <Field
          colours={[story.element.colour]}
          emojis={story.element.emoji}
          kicker="the champion"
          headline={`${story.element.name} wins the most`}
          sub={`It beats ${story.winCount} of the other ${story.opponentCount}.`}
        />
      );
    case "argument":
      return (
        <Field
          colours={story.elements.map(({ colour }) => colour)}
          emojis={story.elements.map(({ emoji }) => emoji).join("")}
          kicker="the argument"
          headline={`${story.elements[0].name} against ${story.elements[1].name}`}
          sub={`The crowd is split down the middle, over ${story.voteCount} Votes.`}
        />
      );
    case "triangle":
      return (
        <Field
          colours={story.elements.map(({ colour }) => colour)}
          emojis={story.elements.map(({ emoji }) => emoji).join("")}
          kicker="a perfect triangle"
          headline={`${story.elements[0].name} beats ${story.elements[1].name} beats ${story.elements[2].name} beats ${story.elements[0].name}`}
          sub="Rock, paper, scissors, found by the crowd."
        />
      );
    case "biggest-crush":
      return (
        <Field
          colours={[story.winner.colour]}
          emojis={story.winner.emoji}
          kicker="the biggest crush"
          headline={`${story.winner.name} flattens ${story.loser.name}`}
          sub={`Nobody argued. ${story.voteCount} Votes.`}
        />
      );
    case "punching-bag":
      return (
        <Field
          colours={[story.element.colour]}
          emojis={story.element.emoji}
          kicker="the punching bag"
          headline={`${story.element.name} loses the most`}
          sub={`It loses to ${story.lossCount} of the other ${story.opponentCount}.`}
        />
      );
    case "glass-cannon":
      return (
        <Field
          colours={[story.element.colour]}
          emojis={story.element.emoji}
          kicker="the glass cannon"
          headline={`${story.element.name} crushes or gets crushed`}
          sub="Few of its Matchups are close."
        />
      );
    case "diplomat":
      return (
        <Field
          colours={[story.element.colour]}
          emojis={story.element.emoji}
          kicker="the diplomat"
          headline={`${story.element.name} picks no fights`}
          sub="More neutral Matchups than any other Element."
        />
      );
    case "you":
      return (
        <Field
          colours={[PAPER]}
          emojis="🫵"
          kicker="you"
          headline={
            story.record
              ? `with the crowd ${percent(story.record.withTheCrowdShare)} of the time`
              : "none of your calls are settled yet"
          }
          sub={
            story.record
              ? takeLine(story.record.hottestTake)
              : "Keep voting: the crowd has not caught up with your Matchups."
          }
        />
      );
  }
}
