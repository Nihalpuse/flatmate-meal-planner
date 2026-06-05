"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getActiveGroup } from "@/lib/groups";
import { ingredientSchema } from "@/lib/pantry/validation";
import { createClient } from "@/lib/supabase/server";

export type PantryState = { error?: string; ok?: boolean };

/** Insert (no id) or update (id present) an ingredient. */
export async function saveIngredient(
  _prev: PantryState,
  formData: FormData,
): Promise<PantryState> {
  const parsed = ingredientSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const id = formData.get("id");

  if (typeof id === "string" && id.length > 0) {
    const { error } = await supabase
      .from("ingredients")
      .update({
        name: parsed.data.name,
        quantity: parsed.data.quantity ?? null,
        unit: parsed.data.unit ?? null,
      })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const session = await auth();
    if (!session?.user?.id) return { error: "No active group" };
    const group = await getActiveGroup(session.user.id);
    if (!group) return { error: "No active group" };
    const { error } = await supabase.from("ingredients").insert({
      group_id: group.id,
      name: parsed.data.name,
      quantity: parsed.data.quantity ?? null,
      unit: parsed.data.unit ?? null,
      available: true,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/pantry");
  return { ok: true };
}

export async function deleteIngredient(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("ingredients").delete().eq("id", id);
  revalidatePath("/pantry");
}

export async function setAvailability(id: string, available: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase.from("ingredients").update({ available }).eq("id", id);
  revalidatePath("/pantry");
}
