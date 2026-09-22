import type { ShowdownElement } from "./schema";
import { type VoteValue, voteValueSchema } from "./showdown-schema";

// A strong win, the furthest either Element can be pulled.
export const STRONG_WIN = 2;

// Drag distances, both well inside a thumb's reach: past the first the seam
// snaps one step, past the second two. Tuned on a real phone.
const WEAK_WIN_DRAG_PX = 36;
const STRONG_WIN_DRAG_PX = 110;

// How far the seam travels from the middle for each step of the Vote.
const SEAM_STEP_PERCENT = 17;

// The five landings, top to bottom: one edge tab marks each.
export const SEAM_LANDINGS = [2, 1, 0, -1, -2] as const satisfies VoteValue[];

// Where the seam rests, as a percentage down the screen, for any point on the
// Vote scale: the five landings and the crowd's mean between them. The winner
// takes ground, so the seam moves away from the Element that is winning.
export const seamAt = (value: number) => 50 + SEAM_STEP_PERCENT * value;

// A drag down is the top Element taking ground, a drag up the bottom one.
export const draggedVote = (dragPx: number): VoteValue => {
  const reach = Math.abs(dragPx);
  if (reach < WEAK_WIN_DRAG_PX) return 0;
  const strength = reach < STRONG_WIN_DRAG_PX ? 1 : STRONG_WIN;
  return voteValueSchema.parse(Math.sign(dragPx) * strength);
};

// One press of an arrow key, which stops at a strong win rather than wrapping.
export const steppedVote = (value: VoteValue, step: number): VoteValue =>
  voteValueSchema.parse(
    Math.max(-STRONG_WIN, Math.min(STRONG_WIN, value + step)),
  );

const verb = (value: VoteValue) =>
  Math.abs(value) === STRONG_WIN ? "crushes" : "beats";

// The Vote as a sentence, which the pill wears and a screen reader hears.
export const voteSentence = (
  value: VoteValue,
  top: ShowdownElement,
  bottom: ShowdownElement,
) =>
  value === 0
    ? "too close to call"
    : `${(value > 0 ? top : bottom).name} ${verb(value)} ${(value > 0 ? bottom : top).name}`;

// An edge tab names its winner by emoji, because the tab sits in the loser's
// colour and a name there would read as the wrong Element's.
export const tabLabel = (
  value: VoteValue,
  top: ShowdownElement,
  bottom: ShowdownElement,
) =>
  value === 0
    ? "too close"
    : `${(value > 0 ? top : bottom).emoji} ${verb(value)}`;
