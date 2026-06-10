"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { getActiveGroup } from "@/lib/groups";
import { ingredientSchema } from "@/lib/pantry/validation";

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
