import { describe, expect, it } from "vitest";
import { db } from "@/db/index.server";
import { listApprovedEntries } from "./guestbook.server";
import { guestbookEntries } from "./schema";

describe("listApprovedEntries", () => {
  it("excludes pending entries", async () => {
    await db.insert(guestbookEntries).values([
      { name: "Approved", message: "shown", approvedAt: new Date() },
      { name: "Pending", message: "hidden" },
    ]);

    const rows = await listApprovedEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Approved");
  });

  it("returns approved entries newest first", async () => {
    await db.insert(guestbookEntries).values([
      {
        name: "Older",
        message: "m",
        createdAt: new Date("2020-01-01"),
        approvedAt: new Date(),
      },
      {
        name: "Newer",
        message: "m",
        createdAt: new Date("2024-01-01"),
        approvedAt: new Date(),
      },
    ]);

    const rows = await listApprovedEntries();
    expect(rows.map((r) => r.name)).toEqual(["Newer", "Older"]);
  });

  it("caps the result at the limit", async () => {
    const values = Array.from({ length: 105 }, (_, i) => ({
      name: `Entry ${i}`,
      message: "m",
      approvedAt: new Date(),
    }));
    await db.insert(guestbookEntries).values(values);

    expect(await listApprovedEntries()).toHaveLength(100);
    expect(await listApprovedEntries(10)).toHaveLength(10);
  });
});
