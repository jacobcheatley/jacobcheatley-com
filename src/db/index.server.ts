import { drizzle } from "drizzle-orm/node-postgres";
import * as blog from "@/projects/blog/schema";
import * as stickyNotes from "@/projects/sticky-notes/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const db = drizzle(url, { schema: { ...stickyNotes, ...blog } });
// The approval CLI prints this before it writes: the guard against approving on
// the wrong environment.
export const dbHost = new URL(url).host;

// The one Local / Production split: the seed refuses a Production database and
// the Blog editor labels itself from it. The host carries a port, the name does
// not.
export const isLocalDatabase = (host: string) =>
  host.split(":")[0] === "localhost";
