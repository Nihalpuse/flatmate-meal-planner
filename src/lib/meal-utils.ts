// Pure helpers with no database imports — safe to use from client components.

/** Lowercased, whitespace-collapsed, naive-singular form for matching. */
function normalizeIngredient(name: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.length <= 3) return n;
  if (n.endsWith("ies")) return `${n.slice(0, -3)}y`; // chillies -> chilly
  if (n.endsWith("oes")) return n.slice(0, -2); // tomatoes -> tomato
  if (n.endsWith("s") && !n.endsWith("ss")) return n.slice(0, -1); // eggs -> egg
  return n;
}

/** Required ingredients not present (plural/case-insensitive) in the available list. */
export function missingIngredients(required: string[], available: string[]): string[] {
  const have = new Set(available.map(normalizeIngredient));
  return required.filter((r) => !have.has(normalizeIngredient(r)));
}

/** YYYY-MM-DD for the given instant in the given IANA timezone. */
export function toDateString(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
