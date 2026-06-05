import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { groupMembers, groups, users } from "@/db/schema";

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

export async function getGroupSettings(userId: string): Promise<GroupSettings | null> {
  const [membership] = await db
    .select({ groupId: groupMembers.groupId, role: groupMembers.role })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groupMembers.joinedAt))
    .limit(1);
  if (!membership) return null;

  const [group] = await db
    .select({ name: groups.name, inviteCode: groups.inviteCode })
    .from(groups)
    .where(eq(groups.id, membership.groupId))
    .limit(1);
  if (!group) return null;

  const memberRows = await db
    .select({ id: users.id, name: users.name, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, membership.groupId))
    .orderBy(asc(groupMembers.joinedAt));

  return {
    id: membership.groupId,
    name: group.name,
    inviteCode: group.inviteCode,
    role: membership.role,
    members: memberRows.map((m) => ({ ...m, isYou: m.id === userId })),
  };
}
