/** Validate the model's JSON array of ingredient names into clean lowercase strings. */
export function parseDishIngredients(jsonText: string, limit = 12): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const v = item.trim().toLowerCase();
    if (v) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}
