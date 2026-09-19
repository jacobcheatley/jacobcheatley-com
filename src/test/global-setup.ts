import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, DatabaseError } from "pg";

export default async function setup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const url = new URL(dbUrl);
  const testDb = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${testDb}"`);
  } catch (err) {
    // 42P04 = duplicate_database
    if (!(err instanceof DatabaseError) || err.code !== "42P04") throw err;
  } finally {
    await admin.end();
  }

  const db = drizzle(dbUrl);
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.$client.end();
}
