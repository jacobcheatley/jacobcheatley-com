import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { DatabaseError } from "pg";
import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import { elements, votes } from "./schema";
import type { ElementKind } from "./showdown-schema";
import { voterSchema } from "./voter-cookie";

const ROSTER_MIGRATION = "drizzle/0003_element_roster.sql";

const VOTER = voterSchema.parse("11111111-1111-4111-8111-111111111111");

async function insertElement(name: string, kind: ElementKind = "common") {
  const [element] = await db
    .insert(elements)
    .values({ name, emoji: "🔥", colour: "#f2541b", kind })
    .returning({ id: elements.id });
  if (!element) throw new Error("insert returned no row");
  return element.id;
}

// Drizzle reports a rejected statement as its own error naming the query; the
// constraint Postgres tripped over is on the cause.
async function constraintRefusing(statement: Promise<unknown>) {
  try {
    await statement;
  } catch (err) {
    const cause = err instanceof Error ? err.cause : err;
    if (cause instanceof DatabaseError) return cause.constraint;
    throw err;
  }
  throw new Error("the statement was accepted");
}

// The migration is replayed rather than counted in place: the suite truncates
// every table before each test, so the rows it seeded are already gone.
async function seedRoster() {
  await db.execute(sql.raw(await readFile(ROSTER_MIGRATION, "utf8")));
  return db.select().from(elements);
}

describe("the roster migration", () => {
  it("seeds 52 Elements, 20 of them Common", async () => {
    const roster = await seedRoster();

    expect(roster).toHaveLength(52);
    expect(roster.filter((element) => element.kind === "common")).toHaveLength(
      20,
    );
  });

  it("seeds every Element Active", async () => {
    const roster = await seedRoster();

    expect(roster.every((element) => element.isActive)).toBe(true);
  });
});

describe("elements", () => {
  it("takes a rename, a recolour, a re-emoji and a deactivation as one update", async () => {
    const id = await insertElement("fire");

    await db
      .update(elements)
      .set({
        name: "inferno",
        emoji: "🌋",
        colour: "#000000",
        isActive: false,
      })
      .where(eq(elements.id, id));

    expect(await db.select().from(elements)).toEqual([
      {
        id,
        name: "inferno",
        emoji: "🌋",
        colour: "#000000",
        kind: "common",
        isActive: false,
      },
    ]);
  });

  it("cannot be deleted once it has Votes", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    await db
      .insert(votes)
      .values({ voter: VOTER, elementLow: fire, elementHigh: water, value: 2 });

    const refusedBy = await constraintRefusing(
      db.delete(elements).where(eq(elements.id, fire)),
    );

    expect(refusedBy).toBe("votes_element_low_elements_id_fk");
  });
});

describe("votes", () => {
  it("refuses a value past a strong win", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");

    // Raw SQL: the column's type already rules a 3 out of every call site, so
    // only a statement written by hand can reach the CHECK.
    const refusedBy = await constraintRefusing(
      db.execute(
        sql`insert into ${votes} ("voter", "element_low", "element_high", "value") values (${VOTER}, ${fire}, ${water}, 3)`,
      ),
    );

    expect(refusedBy).toBe("votes_value_step");
  });

  it("refuses a Matchup stored the wrong way round", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");

    const refusedBy = await constraintRefusing(
      db.insert(votes).values({
        voter: VOTER,
        elementLow: water,
        elementHigh: fire,
        value: 1,
      }),
    );

    expect(refusedBy).toBe("votes_element_order");
  });

  it("holds one Vote per Voter per Matchup", async () => {
    const fire = await insertElement("fire");
    const water = await insertElement("water");
    const matchup = {
      voter: VOTER,
      elementLow: fire,
      elementHigh: water,
    } as const;
    await db.insert(votes).values({ ...matchup, value: 2 });

    const refusedBy = await constraintRefusing(
      db.insert(votes).values({ ...matchup, value: -1 }),
    );

    expect(refusedBy).toBe("votes_voter_matchup");
  });
});
