import { env } from "@/env";
import { buildSuggestionPrompt, type SuggestionInput } from "./prompt";
import { parseSuggestions, type Suggestion } from "./parse";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 15_000;

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      mealName: { type: "STRING" },
      requiredIngredients: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["mealName", "requiredIngredients"],
  },
} as const;

export async function generateMealSuggestions(
  input: SuggestionInput,
): Promise<Suggestion[]> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildSuggestionPrompt(input) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status}`);
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  return parseSuggestions(text);
}
