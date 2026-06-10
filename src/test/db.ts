import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/db/schema";

/**
 * In-memory Postgres with the real migrations applied.
 * Use from a test file via:
 *   vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
