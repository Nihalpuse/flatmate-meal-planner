export function buildPurchasePrompt(text: string): string {
  return [
    "You are a grocery assistant for flatmates in India.",
    "The user describes what they just bought, in natural language.",
    "Extract a list of pantry items.",
    "Rules:",
    '- Use simple lowercase ingredient names (e.g. "potato", "egg", "milk").',
    "- Set quantity as a number when stated; omit it when not stated.",
    "- Use short units: kg, g, l, ml, pcs.",
    '- Expand count words to pcs: "a dozen" => quantity 12, unit "pcs"; "a pair" => 2 pcs.',
    '- Convert fractions to decimals: "half kg" => 0.5 kg.',
    "- One entry per distinct item.",
    "Return ONLY JSON matching the requested schema.",
    `User said: ${text}`,
  ].join("\n");
}
