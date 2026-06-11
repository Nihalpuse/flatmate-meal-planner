export interface SuggestionInput {
  availableIngredients: string[];
  recentMeals: string[];
  mealType: "lunch" | "dinner";
}

export function buildSuggestionPrompt(input: SuggestionInput): string {
  const available = input.availableIngredients.length
    ? input.availableIngredients.join(", ")
    : "none listed";
  const recent = input.recentMeals.length ? input.recentMeals.join(", ") : "none";

  return [
    "You are a meal-planning assistant for flatmates in India.",
    `Suggest 5 simple, budget-friendly, easy-to-cook ${input.mealType} dishes.`,
    `Available ingredients: ${available}.`,
    "Prefer dishes that mostly use the available ingredients; a few may need 1-2 extra common items.",
    `Recently eaten (do NOT repeat these): ${recent}.`,
    "For each dish list its key required ingredients as simple lowercase names.",
    "When a required ingredient matches one of the available ingredients, use the exact spelling from the available list.",
    "Return ONLY JSON matching the requested schema.",
  ].join("\n");
}
