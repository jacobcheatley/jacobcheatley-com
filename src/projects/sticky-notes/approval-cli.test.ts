import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { NoteContent } from "./note-schema";
import {
  addNote,
  listApprovedNotes,
  listPendingNotes,
} from "./sticky-notes.server";

const content: NoteContent = {
  version: 1,
  w: 500,
  h: 500,
  colour: "yellow",
  rotation: 0,
  curl: { bl: 0, br: 0 },
  fastener: "none",
  elements: [],
};

// The real CLI, not the module it calls: the exit code is the contract.
function runApprove(id: number) {
  return spawnSync(
    "bun",
    ["run", "scripts/sticky-notes.ts", "approve", String(id)],
    { encoding: "utf8" },
  );
}

describe("sticky-notes approve", () => {
  it("approves a pending note and exits 0", async () => {
    const id = await addNote({ author: "ada", content });

    const run = runApprove(id);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`#${id}`);
    expect(run.stderr).toBe("");
    expect(await listApprovedNotes()).toHaveLength(1);
  });

  it("exits 1 naming an unknown id", async () => {
    const id = 4242;

    const run = runApprove(id);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`#${id}`);
  });

  it("exits 1 when the note is already approved", async () => {
    const id = await addNote({ author: "ada", content });
    expect(runApprove(id).status).toBe(0);

    const second = runApprove(id);

    expect(second.status).toBe(1);
    expect(second.stderr).toContain(`#${id}`);
    expect(await listPendingNotes()).toHaveLength(0);
  });
});
