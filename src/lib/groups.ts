import { randomInt } from "node:crypto";
import { cache } from "react";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";

export interface ActiveGroup {
  id: string;
  name: string;
}

type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The user's earliest membership row, or null. */
async function membershipOf(client: DbClient, userId: string) {
  const [m] = await client
    .select({
      id: groupMembers.id,
      groupId: groupMembers.groupId,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groupMembers.joinedAt))
    .limit(1);
  return m ?? null;
}

/** The user's single active group (earliest membership), or null. Cached per request. */
export const getActiveGroup = cache(
  async (userId: string): Promise<ActiveGroup | null> => {
    const rows = await db
      .select({ id: groups.id, name: groups.name })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, userId))
      .orderBy(asc(groupMembers.joinedAt))
      .limit(1);
    return rows[0] ?? null;
  },
);

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function inviteCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export type GroupResult = { groupId?: string; error?: string };

/** Create a group with the user as admin (transaction; retries on code collision). */
export async function createGroupForUser(
  userId: string,
  name: string,
): Promise<GroupResult> {
  if (await membershipOf(db, userId)) {
    return { error: "You're already in a group. Leave it from Settings first." };
  }
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
      return { groupId };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  return { error: "Could not generate a unique invite code" };
}

/** Join a group by invite code. */
export async function joinGroupForUser(
  userId: string,
  code: string,
): Promise<GroupResult> {
  if (await membershipOf(db, userId)) {
    return { error: "You're already in a group. Leave it from Settings first." };
  }
  const normalized = code.trim().toUpperCase();
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.inviteCode, normalized))
    .limit(1);
  if (!group) return { error: "No group found for that code" };

  await db
    .insert(groupMembers)
    .values({ groupId: group.id, userId, role: "member" })
    .onConflictDoNothing({ target: [groupMembers.groupId, groupMembers.userId] });

  return { groupId: group.id };
}

export interface GroupContext {
  id: string;
  name: string;
  timezone: string;
  role: "admin" | "member";
  memberCount: number;
}

/** The user's active group with their role and the member count. Cached per request. */
export const getGroupContext = cache(
  async (userId: string): Promise<GroupContext | null> => {
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
  },
);

/** Leave the active group. Last member deletes the group; sole admin must promote first. */
export async function leaveGroupForUser(userId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const membership = await membershipOf(tx, userId);
    if (!membership) return "You are not in a group";

    const members = await tx
      .select({ userId: groupMembers.userId, role: groupMembers.role })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, membership.groupId));

    if (members.length === 1) {
      // Cascades memberships, ingredients, sessions, suggestions, votes.
      await tx.delete(groups).where(eq(groups.id, membership.groupId));
      return null;
    }

    const otherAdmins = members.filter((m) => m.userId !== userId && m.role === "admin");
    if (membership.role === "admin" && otherAdmins.length === 0) {
      return "Promote another member to admin before leaving";
    }
    await tx.delete(groupMembers).where(eq(groupMembers.id, membership.id));
    return null;
  });
}

/** Admin-only: remove another member from the admin's group. */
export async function removeMemberFromGroup(
  adminUserId: string,
  targetUserId: string,
): Promise<string | null> {
  if (adminUserId === targetUserId) return "Use leave group instead";
  return db.transaction(async (tx) => {
    const admin = await membershipOf(tx, adminUserId);
    if (!admin || admin.role !== "admin") return "Only an admin can remove members";
    const deleted = await tx
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, admin.groupId),
          eq(groupMembers.userId, targetUserId),
        ),
      )
      .returning({ id: groupMembers.id });
    return deleted.length === 0 ? "Member not found" : null;
  });
}

/** Admin-only: promote a member of the admin's group to admin. */
export async function promoteMemberToAdmin(
  adminUserId: string,
  targetUserId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const admin = await membershipOf(tx, adminUserId);
    if (!admin || admin.role !== "admin") return "Only an admin can promote members";
    const updated = await tx
      .update(groupMembers)
      .set({ role: "admin" })
      .where(
        and(
          eq(groupMembers.groupId, admin.groupId),
          eq(groupMembers.userId, targetUserId),
        ),
      )
      .returning({ id: groupMembers.id });
    return updated.length === 0 ? "Member not found" : null;
  });
}

/** Admin-only: regenerate the group's invite code. */
export async function rotateGroupInviteCode(
  adminUserId: string,
): Promise<{ code?: string; error?: string }> {
  const admin = await membershipOf(db, adminUserId);
  if (!admin || admin.role !== "admin") {
    return { error: "Only an admin can rotate the invite code" };
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = inviteCode();
    try {
      await db
        .update(groups)
        .set({ inviteCode: code, updatedAt: new Date() })
        .where(eq(groups.id, admin.groupId));
      return { code };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  return { error: "Could not generate a unique invite code" };
}
