import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/projects/sticky-notes/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const db = drizzle(url, { schema });
// The approval CLI prints this before it writes: the guard against approving on
// the wrong environment.
export const dbHost = new URL(url).host;
