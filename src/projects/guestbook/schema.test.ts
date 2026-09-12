import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import { guestbookEntries } from "./schema";

describe("guestbook schema", () => {
  it("inserts and reads an entry through db, pending by default", async () => {
    const [inserted] = await db
      .insert(guestbookEntries)
      .values({ name: "Ada", message: "Hello" })
      .returning();
    expect(inserted?.id).toBeGreaterThan(0);
    expect(inserted?.approvedAt).toBeNull();

    const rows = await db.select().from(guestbookEntries);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Ada");
  });
});
