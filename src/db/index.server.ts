import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/projects/sticky-notes/schema";

// The only runtime reader of DATABASE_URL. (drizzle-kit's config and the Vitest
// bootstrap read it too, but those run outside the app process.)
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const db = drizzle(url, { schema });
// For the approval CLI to print before it writes — the guard against approving
// on the wrong environment.
export const dbHost = new URL(url).host;
