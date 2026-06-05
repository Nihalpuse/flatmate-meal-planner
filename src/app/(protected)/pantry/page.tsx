import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PantryView } from "@/components/pantry/pantry-view";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { getActiveGroup } from "@/lib/groups";

export default async function PantryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  const rows = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.groupId, group.id))
    .orderBy(asc(ingredients.name));

  return <PantryView ingredients={rows} />;
}
