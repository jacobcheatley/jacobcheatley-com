import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";
import { db } from "@/db/index.server";

// ponytail: serial suite on one shared test DB; upgrade to app_test_${VITEST_POOL_ID} per worker when the suite gets slow.
beforeEach(async () => {
  const result = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`,
  );
  const tables = result.rows.map((row) => `"${row.tablename}"`);
  if (tables.length === 0) return;
  await db.execute(
    sql.raw(`truncate table ${tables.join(", ")} restart identity cascade`),
  );
});
