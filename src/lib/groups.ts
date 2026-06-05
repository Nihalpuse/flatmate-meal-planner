import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export interface ActiveGroup {
  id: string;
  name: string;
}

/**
 * The user's single active group (earliest membership), or null if none.
 * RLS limits `group_members` rows to the current user's own memberships.
 */
export async function getActiveGroup(
  supabase: SupabaseClient<Database>,
): Promise<ActiveGroup | null> {
  const { data } = await supabase
    .from("group_members")
    .select("groups(id, name)")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = data as { groups: ActiveGroup | null } | null;
  const group = (row?.groups ?? null) as ActiveGroup | null;
  return group;
}
