import { env } from "@/env";
import { buildPurchasePrompt } from "./purchase-prompt";
import { buildSuggestionPrompt, type SuggestionInput } from "./prompt";
import { parsePurchaseItems, type ParsedItem } from "./parse-purchase";
import { parseSuggestions, type Suggestion } from "./parse";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 15_000;

const SUGGESTION_SCHEMA = {
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

const PURCHASE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" },
      quantity: { type: "NUMBER" },
      unit: { type: "STRING" },
    },
    required: ["name"],
  },
} as const;

/** POST a prompt + response schema to Gemini and return the raw JSON text. */
async function generateJson(prompt: string, schema: unknown): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
}

export async function generateMealSuggestions(
  input: SuggestionInput,
): Promise<Suggestion[]> {
  const text = await generateJson(buildSuggestionPrompt(input), SUGGESTION_SCHEMA);
  return parseSuggestions(text);
}

/** Parse a free-text "what I bought" message into structured pantry items. */
export async function parsePurchase(text: string): Promise<ParsedItem[]> {
  const out = await generateJson(buildPurchasePrompt(text), PURCHASE_SCHEMA);
  return parsePurchaseItems(out);
}
