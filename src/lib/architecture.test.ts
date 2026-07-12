// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

const LIB = join(process.cwd(), "src", "lib");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!entry.endsWith(".ts") || entry.includes(".test.")) return [];
    return [path];
  });
}

/**
 * lib/ is the data layer: plain functions over Drizzle, no framework.
 *
 * Keeping it free of Next imports is what lets it be called from anywhere — a
 * route handler, a separate API service, a one-off script — without dragging the
 * framework along. It is also the seam that makes "should we split the backend
 * out?" a cheap decision to defer rather than a rewrite.
 *
 * Framework concerns (caching directives, revalidation, request memoization) go in
 * the app/ layer, next to the action that needs them. This drifted once already
 * when unstable_cache was added to lib/dishes.ts, hence the guard.
 *
 * `react` is tolerated: its cache() degrades to a plain passthrough outside a
 * request, so it does not actually couple us to a runtime.
 */
test("lib/ stays free of Next imports", () => {
  const offenders = sourceFiles(LIB)
    .map((path) => ({
      path,
      imports: [...readFileSync(path, "utf8").matchAll(/from\s+"(next(?:\/[^"]*)?)"/g)].map(
        (m) => m[1],
      ),
    }))
    .filter((f) => f.imports.length > 0)
    .map((f) => `${f.path.replace(process.cwd(), "").replace(/\\/g, "/")} → ${f.imports.join(", ")}`);

  expect(offenders).toEqual([]);
});
