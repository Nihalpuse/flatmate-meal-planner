// @vitest-environment node
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, users } from "@/db/schema";
import {
  createGroupForUser,
  getActiveGroup,
  joinGroupForUser,
  leaveGroupForUser,
  promoteMemberToAdmin,
  removeMemberFromGroup,
  rotateGroupInviteCode,
} from "./groups";

beforeAll(async () => {
  await db.insert(users).values([
    { id: "alice", email: "alice@x.y" },
    { id: "bob", email: "bob@x.y" },
    { id: "cara", email: "cara@x.y" },
  ]);
});

test("create + join via invite code", async () => {
  const created = await createGroupForUser("alice", "Flat 302");
  expect(created.groupId).toBeTruthy();
  const [g] = await db.select().from(groups).where(eq(groups.id, created.groupId!));
  const joined = await joinGroupForUser("bob", g.inviteCode.toLowerCase());
  expect(joined.groupId).toBe(g.id);
});

test("a user already in a group cannot create or join another", async () => {
  expect((await createGroupForUser("alice", "Second")).error).toMatch(/already in a group/i);
  expect((await joinGroupForUser("bob", "ZZZZZZ")).error).toMatch(/already in a group/i);
});

test("joining with an unknown code errors", async () => {
  expect((await joinGroupForUser("cara", "ZZZZZZ")).error).toBe(
    "No group found for that code",
  );
});

test("admin can promote and remove members; non-admin cannot", async () => {
  expect(await removeMemberFromGroup("bob", "alice")).toBe(
    "Only an admin can remove members",
  );
  expect(await promoteMemberToAdmin("alice", "bob")).toBeNull();
  // bob is now admin too; alice can leave even though others remain
  expect(await leaveGroupForUser("alice")).toBeNull();
  expect(await getActiveGroup("alice")).toBeNull();
});

test("sole admin with other members cannot leave", async () => {
  const g = await getActiveGroup("bob");
  await joinGroupForUser(
    "cara",
    (await db.select().from(groups).where(eq(groups.id, g!.id)))[0].inviteCode,
  );
  expect(await leaveGroupForUser("bob")).toMatch(/promote another member/i);
});

test("admin can remove a member", async () => {
  expect(await removeMemberFromGroup("bob", "cara")).toBeNull();
  expect(await getActiveGroup("cara")).toBeNull();
});

test("rotate invite code changes it (admin only)", async () => {
  const g = await getActiveGroup("bob");
  const before = (await db.select().from(groups).where(eq(groups.id, g!.id)))[0].inviteCode;
  expect((await rotateGroupInviteCode("cara")).error).toMatch(/only an admin/i);
  const rotated = await rotateGroupInviteCode("bob");
  expect(rotated.code).toBeTruthy();
  expect(rotated.code).not.toBe(before);
});

test("last member leaving deletes the group", async () => {
  const g = await getActiveGroup("bob");
  expect(await leaveGroupForUser("bob")).toBeNull();
  expect(await db.select().from(groups).where(eq(groups.id, g!.id))).toHaveLength(0);
  expect(await db.select().from(groupMembers)).toHaveLength(0);
});
