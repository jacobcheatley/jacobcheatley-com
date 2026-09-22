import { describe, expect, it } from "vitest";
import { elementPageOf } from "./element-page";
import type { Confidence, Effectiveness } from "./matchup-score";
import type { CrowdCalls, JudgedMatchup, ShownElement } from "./showdown-stats";

const named = (id: number, name: string): ShownElement => ({
  id,
  name,
  emoji: "🔥",
  colour: "#f2541b",
});

const fire = named(1, "fire");
const water = named(2, "water");
const plant = named(3, "plant");
const rock = named(4, "rock");

// A call the crowd has made, read from the lower-id Element's side: `fire`
// beating `water` and `water` losing to `fire` are the same row.
const call = (
  elementLow: ShownElement,
  elementHigh: ShownElement,
  effectiveness: Effectiveness,
  meanVote: number,
  confidence: Confidence = "solid",
): JudgedMatchup => ({
  elementLow: elementLow.id,
  elementHigh: elementHigh.id,
  effectiveness,
  confidence,
  meanVote,
});

const calls = (
  elements: ShownElement[],
  matchups: JudgedMatchup[],
): CrowdCalls => ({ elements, matchups });

describe("an Element's page", () => {
  it("puts each opponent in the band of the crowd's call on it, and shows no other band", () => {
    const page = elementPageOf(
      calls(
        [fire, water, plant],
        [call(fire, water, "½×", -0.8), call(fire, plant, "4×", 1.9)],
      ),
      fire,
    );

    expect(page.bands).toEqual([
      {
        effectiveness: "4×",
        verb: "crushes",
        opponents: [{ opponent: plant, confidence: "solid" }],
      },
      {
        effectiveness: "½×",
        verb: "loses to",
        opponents: [{ opponent: water, confidence: "solid" }],
      },
    ]);
  });

  it("reads a Matchup mirrored from the higher-id Element's side", () => {
    const beaten = calls([fire, water], [call(fire, water, "2×", 1.2)]);

    expect(elementPageOf(beaten, fire).bands).toMatchObject([
      { effectiveness: "2×", opponents: [{ opponent: water }] },
    ]);
    expect(elementPageOf(beaten, water).bands).toMatchObject([
      { effectiveness: "½×", opponents: [{ opponent: fire }] },
    ]);
  });

  it("orders a band's chips by how strongly the crowd called them", () => {
    const page = elementPageOf(
      calls(
        [fire, water, plant, rock],
        [
          call(fire, water, "2×", 0.7),
          call(fire, plant, "2×", 1.4),
          call(fire, rock, "2×", 1.1),
        ],
      ),
      fire,
    );

    expect(
      page.bands[0]?.opponents.map(({ opponent }) => opponent.name),
    ).toEqual(["plant", "rock", "water"]);
  });

  it("counts a win as 2× or 4× and a loss as ½× or ¼×, from this Element's side", () => {
    const page = elementPageOf(
      calls(
        [fire, water, plant, rock],
        [
          call(fire, water, "¼×", -1.8),
          call(fire, plant, "4×", 1.9),
          call(fire, rock, "2×", 0.9),
        ],
      ),
      fire,
    );

    expect(page).toMatchObject({ winCount: 2, lossCount: 1 });
  });

  it("counts a Neutral Matchup as neither a win nor a loss", () => {
    const page = elementPageOf(
      calls(
        [fire, water, plant],
        [
          call(fire, water, "neutral", 0.1),
          call(fire, plant, "controversial", 0),
        ],
      ),
      fire,
    );

    expect(page).toMatchObject({ winCount: 0, lossCount: 0 });
  });

  it("names the opponent it does worst against its nemesis, and the one it does best against its favourite victim", () => {
    const page = elementPageOf(
      calls(
        [fire, water, plant, rock],
        [
          call(fire, water, "½×", -0.9),
          call(fire, plant, "4×", 1.9),
          call(fire, rock, "¼×", -1.7),
        ],
      ),
      fire,
    );

    expect(page).toMatchObject({ nemesis: rock, favouriteVictim: plant });
  });

  it("gives a tie for nemesis to the alphabetically first opponent", () => {
    const page = elementPageOf(
      calls(
        [fire, water, plant, rock],
        [
          call(fire, water, "½×", -1),
          call(fire, plant, "½×", -1),
          call(fire, rock, "½×", -1),
        ],
      ),
      fire,
    );

    expect(page.nemesis).toEqual(plant);
  });

  it("leaves an Element nobody has judged yet without a nemesis or a victim", () => {
    const page = elementPageOf(calls([fire, water], []), fire);

    expect(page).toMatchObject({
      nemesis: null,
      favouriteVictim: null,
      bands: [],
    });
  });

  it("counts every opponent the crowd has not judged rather than banding it", () => {
    const page = elementPageOf(
      calls([fire, water, plant, rock], [call(fire, water, "2×", 1.2)]),
      fire,
    );

    expect(page.notYetJudgedCount).toBe(2);
  });

  it("counts the Matchups of other Elements as nothing of its own", () => {
    const page = elementPageOf(
      calls([fire, water, plant], [call(water, plant, "2×", 1.2)]),
      fire,
    );

    expect(page).toMatchObject({ bands: [], notYetJudgedCount: 2 });
  });
});
