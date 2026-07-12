import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { groupMembers, groups, users } from "@/db/schema";
import type { GroupContext } from "@/lib/groups";

export interface MemberInfo {
  id: string;
  name: string | null;
  role: "admin" | "member";
  isYou: boolean;
}

export interface GroupSettings {
  id: string;
  name: string;
  inviteCode: string;
  role: "admin" | "member";
  members: MemberInfo[];
}

/**
 * Settings for a group the caller has already resolved.
 *
 * Takes the group context rather than a userId: the protected layout has already
 * loaded the id, name and role, so this only fetches what it doesn't know — the
 * invite code and the member list.
 */
export async function getGroupSettings(
  group: GroupContext,
  userId: string,
): Promise<GroupSettings | null> {
  const [[row], memberRows] = await Promise.all([
    db
      .select({ inviteCode: groups.inviteCode })
      .from(groups)
      .where(eq(groups.id, group.id))
      .limit(1),
    db
      .select({ id: users.id, name: users.name, role: groupMembers.role })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, group.id))
      .orderBy(asc(groupMembers.joinedAt)),
  ]);
  if (!row) return null;

  return {
    id: group.id,
    name: group.name,
    inviteCode: row.inviteCode,
    role: group.role,
    members: memberRows.map((m) => ({ ...m, isYou: m.id === userId })),
  };
}
