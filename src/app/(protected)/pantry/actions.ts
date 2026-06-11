"use server";

import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { parsePurchase } from "@/lib/ai/gemini";
import type { ParsedItem } from "@/lib/ai/parse-purchase";
import { isUniqueViolation } from "@/lib/db-errors";
import { getActiveGroup } from "@/lib/groups";
import { resolveMergedValues } from "@/lib/pantry/merge";
import { ingredientSchema } from "@/lib/pantry/validation";
import { rateLimit } from "@/lib/rate-limit";

export type PantryState = { error?: string; ok?: boolean };

/** The current user's active group id, or null if unauthenticated / no group. */
async function activeGroupId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const group = await getActiveGroup(session.user.id);
  return group?.id ?? null;
}

/** Insert (no id) or update (id present) an ingredient in the user's group. */
export async function saveIngredient(
  _prev: PantryState,
  formData: FormData,
): Promise<PantryState> {
  const parsed = ingredientSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const groupId = await activeGroupId();
  if (!groupId) return { error: "No active group" };

  const id = formData.get("id");
  try {
    if (typeof id === "string" && id.length > 0) {
      await db
        .update(ingredients)
        .set({
          name: parsed.data.name,
          quantity: parsed.data.quantity ?? null,
          unit: parsed.data.unit ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(ingredients.id, id), eq(ingredients.groupId, groupId)));
    } else {
      await db.insert(ingredients).values({
        groupId,
        name: parsed.data.name,
        quantity: parsed.data.quantity ?? null,
        unit: parsed.data.unit ?? null,
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "That ingredient is already in your pantry" };
    }
    throw error;
  }

  revalidatePath("/pantry");
  return { ok: true };
}

export async function deleteIngredient(id: string): Promise<void> {
  const groupId = await activeGroupId();
  if (!groupId) return;
  await db
    .delete(ingredients)
    .where(and(eq(ingredients.id, id), eq(ingredients.groupId, groupId)));
  revalidatePath("/pantry");
}

export async function setAvailability(
  id: string,
  available: boolean,
): Promise<void> {
  const groupId = await activeGroupId();
  if (!groupId) return;
  await db
    .update(ingredients)
    .set({ available })
    .where(and(eq(ingredients.id, id), eq(ingredients.groupId, groupId)));
  revalidatePath("/pantry");
}

export type ParsePurchaseState = { items?: ParsedItem[]; error?: string };

/** AI-parse a free-text purchase message into items. Does NOT write to the DB. */
export async function parsePurchaseText(text: string): Promise<ParsePurchaseState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const trimmed = text.trim();
  if (!trimmed) return { error: "Type what you bought first." };

  if (!rateLimit(`purchase:${session.user.id}`, 15, 60_000)) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  let items: ParsedItem[];
  try {
    items = await parsePurchase(trimmed);
  } catch {
    return { error: "Could not reach the AI. Please try again." };
  }
  if (items.length === 0) {
    return { error: "Couldn't find any items — try rephrasing." };
  }
  return { items };
}

/** Add reviewed items to the pantry: sum on unit match, replace otherwise. */
export async function addPurchasedItems(items: ParsedItem[]): Promise<PantryState> {
  const groupId = await activeGroupId();
  if (!groupId) return { error: "No active group" };

  const clean: ParsedItem[] = [];
  for (const raw of items) {
    const parsed = ingredientSchema.safeParse({
      name: raw.name,
      quantity: raw.quantity,
      unit: raw.unit,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const item: ParsedItem = { name: parsed.data.name };
    if (parsed.data.quantity !== undefined) item.quantity = parsed.data.quantity;
    if (parsed.data.unit !== undefined) item.unit = parsed.data.unit;
    clean.push(item);
  }
  if (clean.length === 0) return { ok: true };

  await db.transaction(async (tx) => {
    for (const item of clean) {
      const [existing] = await tx
        .select()
        .from(ingredients)
        .where(
          and(
            eq(ingredients.groupId, groupId),
            sql`lower(${ingredients.name}) = lower(${item.name})`,
          ),
        )
        .limit(1);

      const resolved = resolveMergedValues(
        existing ? { quantity: existing.quantity, unit: existing.unit } : null,
        { quantity: item.quantity, unit: item.unit },
      );

      if (existing) {
        await tx
          .update(ingredients)
          .set({
            quantity: resolved.quantity,
            unit: resolved.unit,
            available: true,
            updatedAt: new Date(),
          })
          .where(eq(ingredients.id, existing.id));
      } else {
        await tx.insert(ingredients).values({
          groupId,
          name: item.name,
          quantity: resolved.quantity,
          unit: resolved.unit,
        });
      }
    }
  });

  revalidatePath("/pantry");
  return { ok: true };
}
