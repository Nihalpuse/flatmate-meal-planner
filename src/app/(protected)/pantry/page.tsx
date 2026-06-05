import { PantryView } from "@/components/pantry/pantry-view";
import { createClient } from "@/lib/supabase/server";

export default async function PantryPage() {
  const supabase = await createClient();
  // RLS scopes ingredients to the current user's group(s).
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("*")
    .order("name", { ascending: true });

  return <PantryView ingredients={ingredients ?? []} />;
}
