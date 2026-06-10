import { randomInt } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";

export interface ActiveGroup {
  id: string;
  name: string;
}

/** The user's single active group (earliest membership), or null. */
export async function getActiveGroup(userId: string): Promise<ActiveGroup | null> {
  const rows = await db
    .select({ id: groups.id, name: groups.name })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groupMembers.joinedAt))
    .limit(1);
  return rows[0] ?? null;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function inviteCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Create a group with the user as admin (transaction; retries on code collision). */
export async function createGroupForUser(
  userId: string,
  name: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = inviteCode();
    try {
      const groupId = await db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({ name, inviteCode: code, createdBy: userId })
          .returning({ id: groups.id });
        await tx
          .insert(groupMembers)
          .values({ groupId: group.id, userId, role: "admin" });
        return group.id;
      });
      return groupId;
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique invite code");
}

/** Join a group by invite code. Returns the group id, or null if no match. */
export async function joinGroupForUser(
  userId: string,
  code: string,
): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.inviteCode, normalized))
    .limit(1);
  if (!group) return null;

  await db
    .insert(groupMembers)
    .values({ groupId: group.id, userId, role: "member" })
    .onConflictDoNothing({ target: [groupMembers.groupId, groupMembers.userId] });

  return group.id;
}

export interface GroupContext {
  id: string;
  name: string;
  timezone: string;
  role: "admin" | "member";
  memberCount: number;
}

/** The user's active group with their role and the member count. */
export async function getGroupContext(userId: string): Promise<GroupContext | null> {
  const [membership] = await db
    .select({
      id: groups.id,
      name: groups.name,
      timezone: groups.timezone,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groupMembers.joinedAt))
    .limit(1);
  if (!membership) return null;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, membership.id));

  return { ...membership, memberCount: count };
}
