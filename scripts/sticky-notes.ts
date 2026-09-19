import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dbHost } from "@/db/index.server";
import {
  NOTE_ASPECT_RATIO,
  NoteRender,
} from "@/projects/sticky-notes/note-render";
import {
  approveNote,
  listPendingNotes,
} from "@/projects/sticky-notes/sticky-notes.server";

// Auth is possession of DATABASE_URL, same as db:migrate; the printed host is
// the guard against writing to the wrong environment.

async function pending() {
  const notes = await listPendingNotes();
  // ponytail: no webfonts in the gallery (text falls back to cursive/sans);
  // inline the fontsource woff2s as data URIs if a fallback ever misleads a call.
  // One React tree for every tile: NoteRender's `useId` ids are unique only
  // within a tree, so rendering per note would give every tile the first note's
  // clip path and fold shading.
  const tiles = renderToStaticMarkup(
    h(
      "main",
      null,
      notes.map((n) =>
        h(
          "figure",
          { key: n.id },
          h(
            "div",
            {
              className: "note",
              style: { transform: `rotate(${n.content.rotation}deg)` },
            },
            h(NoteRender, { content: n.content }),
          ),
          h(
            "figcaption",
            null,
            h("b", null, `#${n.id}`),
            ` ${n.author}`,
            h("br"),
            h("small", null, n.createdAt.toISOString()),
          ),
        ),
      ),
    ),
  );
  const html = `<!doctype html><meta charset="utf-8"><title>Pending sticky notes (${notes.length})</title>
<style>
body{margin:0;padding:32px;background:#2b3138;color:#e8e6e1;font:14px system-ui,sans-serif}
h1{font-weight:500;margin:0 0 24px}
main{display:flex;flex-wrap:wrap;gap:40px 32px}
figure{margin:0;width:256px}
.note{aspect-ratio:${NOTE_ASPECT_RATIO};filter:drop-shadow(2px 4px 5px rgba(0,0,0,.35))}
figcaption{margin-top:12px;text-align:center}
small{opacity:.6}
</style>
<h1>${notes.length} pending — approve with <code>bun run sticky-notes approve &lt;id&gt;</code></h1>
${tiles}`;

  const path = join(tmpdir(), "sticky-notes-pending.html");
  await Bun.write(path, html);
  console.log(`${notes.length} pending note(s) → ${path}`);
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    await Bun.spawn([opener, path], { stdio: ["ignore", "ignore", "ignore"] })
      .exited;
  } catch {
    console.log(`(${opener} not available — open the file yourself)`);
  }
}

async function approve(arg: string | undefined) {
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) usage();
  console.log(`target: ${dbHost}`);
  if ((await approveNote(id)) === 0) {
    console.error(`approve failed: note #${id} is unknown or already approved`);
    process.exit(1);
  }
  console.log(`approved note #${id}`);
}

function usage(): never {
  console.error("usage: bun run sticky-notes pending | approve <id>");
  process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "pending") await pending();
else if (cmd === "approve") await approve(arg);
else usage();
process.exit(0);
