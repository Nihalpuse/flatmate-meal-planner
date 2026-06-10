// @vitest-environment node
import { expect, test } from "vitest";

import { users } from "@/db/schema";
import { createTestDb } from "./db";

test("PGlite harness applies migrations and accepts inserts", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ id: "u1", email: "a@b.c", name: "A" });
  const rows = await db.select().from(users);
  expect(rows).toHaveLength(1);
});
