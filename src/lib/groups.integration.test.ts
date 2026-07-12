// @vitest-environment node
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, users } from "@/db/schema";
import {
  createGroupForUser,
  getActiveGroup,
  getGroupContext,
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

// The context (role + member count) is built by one correlated subquery. The
// second group is the point of this test: an uncorrelated count would tally every
// membership row in the table and still look right with only one group around.
test("getGroupContext carries the caller's role and the group's member count", async () => {
  await db.insert(users).values({ id: "dave", email: "dave@x.y" });
  const solo = await createGroupForUser("dave", "Solo Flat");

  const alice = await getGroupContext("alice");
  expect(alice).toMatchObject({ name: "Flat 302", role: "admin", memberCount: 2 });
  expect(alice!.timezone).toBeTruthy();

  const bob = await getGroupContext("bob");
  expect(bob).toMatchObject({ id: alice!.id, role: "member", memberCount: 2 });

  expect(await getGroupContext("dave")).toMatchObject({
    name: "Solo Flat",
    role: "admin",
    memberCount: 1,
  });

  // Leave the shared fixture as we found it — later tests assert on total rows.
  await db.delete(groups).where(eq(groups.id, solo.groupId!));
  await db.delete(users).where(eq(users.id, "dave"));
});

test("getGroupContext is null for a user with no group", async () => {
  expect(await getGroupContext("cara")).toBeNull();
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
