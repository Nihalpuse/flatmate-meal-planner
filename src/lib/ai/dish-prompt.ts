export function buildDishPrompt(name: string): string {
  return [
    "You are a cooking assistant for flatmates in India.",
    "Given a dish name, list its key required ingredients.",
    "Rules:",
    '- Return simple lowercase ingredient names (e.g. "paneer", "tomato").',
    "- Include only the main ingredients (roughly 3 to 8).",
    "- Return ONLY JSON matching the requested schema.",
    `Dish: ${name}`,
  ].join("\n");
}
