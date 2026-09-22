import { INK, PAPER } from "./element-colour";

// One fixed Matchup rather than one drawn from the roster, so the Portfolio
// needs no database to draw a Cover, and these two colours are the same in
// light and dark like every colour in the Project.
const FIRE = "#f2541b";
const WATER = "#2f7fe0";

// Water takes its ground on the same spring the Tug's seam snaps on.
const HOVER_SPRING = "350ms var(--ease-spring)";

// "elemental showdown", two lines, outlined from Bowlby One and tight to the
// ink: the Portfolio shows the Project's display face without loading it.
const LETTERING_BOX = "0 0 636.5 173.5";
const LETTERING_PATH =
  "M46 17q3-1 5-1h5l2 1q5 0 7 1h1q11 3 16 10 2 1 4 4 1 4 1 5l1 1v2q1 3 1 5v3H49v9l1 1v1q0 1 1 1v1l1 1 2 2q3-1 4-3t2-5q1-1 5-1h24q-1 6-4 11-2 4-8 7-15 5-19 5H47q-1 0-6-1h-1l-1-1q-7-2-13-7-5-6-6-13 0-1-1-3v-6q0-11 6-18 6-8 17-11h1q2-1 3-1m9 25h6l1-1q-1-5-2-6 0-2-1-3-1-2-3-2t-4 2q-2 4-3 10zm40 35L94 0h30v77zm61-60q2-1 5-1h4l2 1q5 0 8 1h1q10 3 16 10 1 1 3 4 2 4 2 5v1l1 2q1 3 1 5v3h-41v2q1 1 1 2v6q0 1 1 1v1q0 1 1 1v1q1 1 3 2 3-1 4-3t1-5q2-1 5-1h24q0 6-3 11-3 4-8 7-15 5-19 5h-12q-1 0-5-1h-1l-1-1q-8-2-13-7-5-6-7-13v-3q-1-1-1-2v-2q0-1 1-2 0-11 6-18 6-8 16-11h1q3-1 4-1m8 25h7l1-1q-1-5-2-6-1-2-1-3-2-2-4-2t-3 2q-3 4-4 10zm103-14q9-12 18-12t16 7q3 3 4 7l1 2q1 4 1 5v40h-29V47q0-7-4-7-5 0-5 8v29h-27V47q0-6-4-7-4 0-4 7v30h-31V18h26l1 1q1 7 2 10 4-5 8-9t8-4h3q4 0 9 4 4 3 7 8m70-11q2-1 4-1h5l2 1q5 0 8 1h1q10 3 16 10 1 1 3 4 2 4 2 5v3q1 3 1 5v3h-40v6q0 1 1 2v3l1 1v1l1 1q1 1 3 2 2-1 3-3t2-5q2-1 5-1h24q-1 6-4 11h1q-3 4-8 7-16 5-20 5h-11q-1 0-5-1h-2l-1-1q-7-2-12-7-6-6-7-13 0-1-1-3v-6q0-11 6-18 6-8 17-11h1q3-1 4-1m8 25h6l1-1q-1-5-1-6-1-2-2-3-1-2-3-2t-4 2q-2 4-3 10zm39-24h26q0 1 1 3 1 3 1 5l1 4q2-5 3-6v-1q5-7 15-7 5 0 10 3 4 3 7 8 2 4 2 9v41h-29V47q0-7-4-7t-4 7v30h-29zm107 15v20q0 2 1 3l1 2q0 1 5 1h3v18h-29q-2 0-4-1t-3-2-2-3-2-5V33h-6V19h6V3h30v16h8v14zm38 12 2-1h7q7-1 8-4 1-1 1-4v-2q0-1-2-3-1-1-3-1-5 0-5 8h-29q1-3 2-7 3-8 11-11 9-3 17-4h8l3 1h5q3 0 6 2 12 4 15 18 1 5 1 12v18q0 5 1 9l1 1h-27q-2-3-3-8-1 1-2 3l-2 2q-8 3-11 4h-7q-12 0-18-8-2-4-2-9 0-12 11-15 2 0 10-1zm18 12v-8q-1 1-3 2-2 0-3 1-2 0-3 2-1 1-1 3 0 3 2 4 1 2 3 2 4 0 5-2zm37 20V0h30v77M71 125l-11 1H44q-1-2-3-3-1-1-4-1-2 0-3 1-2 1-2 3 0 1 2 3 1 1 3 2 3 0 5 1h10q2 1 4 1 5 1 8 2t7 4q1 0 2 2 2 3 3 9-1 7-5 13-5 5-13 8h-3q-5 2-8 2H35q-8 0-16-2-19-4-19-16h32v1q0 2 2 4 2 1 5 1t4-1q2-1 2-3t-1-3-3-2h-3q-2-1-4-1h-4q-1-1-3-1h-4q-2-1-4-1t-4-1q-2 0-4-1l-4-2q-7-4-7-13 0-8 4-12 6-6 19-7 1-1 3-1 2-1 3-1t2 1l6-1 8 1h3q6 0 10 1 5 2 9 5 4 4 4 8zm74 9v38h-27v-31q0-4-2-6-1-2-3-2-3 0-4 3t-1 7v29H80V95h28v25q4-4 9-6 5-3 9-3t8 2 6 5l4 8q1 5 1 8m77 8v1q0 8-4 15h1q-5 7-14 11t-18 4-14-1q-6-2-11-5t-7-6q-6-7-6-20 0-1 1-1v-1h-1l1-1q0-8 3-11l1-1 1-1q5-8 13-10l1-1q4-2 9-2h2l1-1h6q11 0 18 5h1q16 8 16 26m-30 0q0-9-3-13-1-1-3-1-1 0-2 2-1 1-2 5t-1 7v5q1 2 1 5l2 4q1 1 2 1 6 0 6-15m89-28 3 23q1-4 2-11l1-5 1-3v-5h32q-3 13-10 48l-3 11h-31l-1-8q-1-6-2-13l-1-8-4 29h-33q-2-8-3-19-2-11-3-13l-1-7-3-20h33v4q2 16 2 21h1v-4q1-3 1-5l2-14v-1zm83 0V96h29v76h-25q-1-2-1-3l-2-3q-5 4-9 6-4 1-10 1-10 0-17-7-6-8-6-20 0-8 1-15 2-7 7-13 4-6 11-7l1 1 4-1q6 0 13 5l1 1 2 1 1-1zm-11 30v3q0 2 1 5 0 2 2 4t3 2h1q5-2 5-14 0-8-2-12-2-3-4-3t-3 3q-3 5-3 12m116-2v1q0 8-3 15-5 7-14 11t-18 4q-8 0-14-1-6-2-11-5-4-3-7-6-5-7-5-20v-3q1-8 3-11l1-1 1-1q6-8 13-10l2-1q3-2 9-2h1q1 0 2-1h6q10 0 18 5h1q15 8 15 26m-30 0q0-9-3-13-1-1-2-1-2 0-3 2-1 1-2 5t-1 7 1 5v5l2 4q1 1 3 1 5 0 5-15m89-28 4 23q0-4 1-11l1-5 1-3q0-4 1-5h32q-3 13-11 48l-3 11h-31l-1-8q-1-6-2-13 0-8-1-8l-4 29h-33q-2-8-3-19-2-11-2-13l-1-7-4-20h33v4q2 16 3 21v-4q1-3 1-5l2-14v-1zm43-1h26q0 1 1 3 0 3 1 5l1 4q2-5 2-6l1-1q5-7 15-7 5 0 9 3 5 3 7 8 3 4 3 9 0 1-1 1v40h-28v-30q0-7-4-7t-4 7v30h-29v-30";

// The Tug in miniature. Everything is sized in `cqw` against the frame, so the
// Cover holds its proportions at any width. `--cover-seam` is where fire meets
// water: one transition on it carries the fire's edge, the seam and the pill
// together, and hovering hands the ground to water.
export function Cover() {
  return (
    <div
      aria-hidden="true"
      className="@container relative size-full motion-safe:group-hover:[--cover-seam:38%] motion-safe:group-focus-visible:[--cover-seam:38%]"
      style={{ background: WATER, transition: `--cover-seam ${HOVER_SPRING}` }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: FIRE,
          // The 6% each way is the tilt: 12% of a 3:2 frame's height across its
          // width is the 4.6° the seam rises to the right.
          clipPath:
            "polygon(0 0, 100% 0, 100% calc(var(--cover-seam) - 6%), 0 calc(var(--cover-seam) + 6%))",
        }}
      />
      <div
        className="-translate-y-1/2 absolute left-[-10%] h-[2.4cqw] w-[120%] rotate-[-4.6deg]"
        style={{ top: "var(--cover-seam)", background: INK }}
      />
      {/* An emoji sits on the baseline of whichever font leads the stack, so
          both wear the sans rather than the Portfolio's serif, whose deep
          ascent would hang them off the top of the frame. */}
      <span
        className="-translate-x-1/2 -translate-y-1/2 absolute top-[23%] left-[17%] scale-100 font-sans text-[22cqw] leading-none motion-safe:group-hover:scale-80 motion-safe:group-focus-visible:scale-80"
        style={{ transition: `scale ${HOVER_SPRING}` }}
      >
        🔥
      </span>
      <span
        className="-translate-x-1/2 -translate-y-1/2 absolute top-[75%] left-[83%] scale-100 font-sans text-[22cqw] leading-none motion-safe:group-hover:scale-120 motion-safe:group-focus-visible:scale-120"
        style={{ transition: `scale ${HOVER_SPRING}` }}
      >
        💧
      </span>
      <div
        className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 rotate-[-7deg] rounded-[5cqw] px-[5cqw] pt-[3.3cqw] pb-[4.5cqw]"
        style={{ top: "var(--cover-seam)", background: INK }}
      >
        <svg
          viewBox={LETTERING_BOX}
          className="block h-[12.8cqw] w-auto"
          aria-hidden="true"
        >
          <path d={LETTERING_PATH} fill={PAPER} />
        </svg>
      </div>
    </div>
  );
}
