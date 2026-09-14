import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NOTE_ASPECT_RATIO,
  NoteRender,
} from "@/projects/sticky-notes/note-render";
import {
  approveNote,
  listPendingNotes,
} from "@/projects/sticky-notes/sticky-notes.server";

// The owner's moderation CLI: `bun run sticky-notes pending | approve <id>`.
// Auth is possession of DATABASE_URL, same as db:migrate; the printed host is
// the guard against writing to the wrong environment.

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch,
  );

async function pending() {
  const notes = await listPendingNotes();
  // ponytail: no webfonts in the gallery (text falls back to cursive/sans);
  // inline the fontsource woff2s as data URIs if a fallback ever misleads a call.
  const tiles = notes.map(
    (n) => `<figure>
  <div class="note" style="transform:rotate(${n.content.rotation}deg)">${renderToStaticMarkup(createElement(NoteRender, { content: n.content }))}</div>
  <figcaption><b>#${n.id}</b> ${escapeHtml(n.author)}<br><small>${n.createdAt.toISOString()}</small></figcaption>
</figure>`,
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
<main>${tiles.join("\n")}</main>`;

  const path = join(tmpdir(), "sticky-notes-pending.html");
  await Bun.write(path, html);
  console.log(`${notes.length} pending note(s) → ${path}`);
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    Bun.spawn([opener, path], { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    console.log(`(${opener} not available — open the file yourself)`);
  }
}

async function approve(arg: string | undefined) {
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) usage();
  // DATABASE_URL is set: importing the db module above already threw otherwise.
  console.log(`target: ${new URL(process.env.DATABASE_URL as string).host}`);
  const rows = await approveNote(id);
  console.log(`approved note #${id}: ${rows} row(s) affected`);
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
