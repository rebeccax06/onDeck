import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { MembershipTrackingConcept, AlreadyInvited, NotInvited, NotAMember, NoSuchGroup, AlreadyAMember, NoSuchInvitation, InvalidName } from "../../src/concepts/MembershipTracking.ts";

const url = process.env.MONGODB_TEST_URL || process.env.MONGODB_URL;
if (!url) throw new Error("Set MONGODB_TEST_URL or MONGODB_URL to run persistence tests.");
const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
let db: Db;
beforeAll(async () => { await client.connect(); });
beforeEach(() => { db = client.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`); });
afterEach(async () => { await db.dropDatabase(); });
afterAll(async () => { await client.close(); });


describe("MembershipTracking with MongoDB", () => {
test("membership principle: create, invite, accept, leave, and preserve empty groups", async () => {
  const concept = new MembershipTrackingConcept(db);
  const { group } = await concept.create({ creator: "rebecca", name: " Roommates " });
  expect(await concept._get({ group })).toEqual([{ group, name: "Roommates" }]);
  const { invitation } = await concept.invite({ inviter: "rebecca", group, invitee: "amy" });
  expect(await concept._invitations({ invitee: "amy" })).toEqual([{ invitation, group, inviter: "rebecca" }]);
  await expect(concept.accept({ invitee: "other", invitation })).rejects.toBeInstanceOf(NotInvited);
  await expect(concept.decline({ invitee: "other", invitation })).rejects.toBeInstanceOf(NotInvited);
  await expect(concept.invite({ inviter: "rebecca", group, invitee: "amy" })).rejects.toBeInstanceOf(AlreadyInvited);
  await concept.accept({ invitee: "amy", invitation });
  expect(await concept._invitation({ invitation })).toEqual([]);
  expect(await concept._members({ group })).toEqual([{ user: "amy" }, { user: "rebecca" }]);
  await expect(concept.invite({ inviter: "rebecca", group, invitee: "amy" })).rejects.toBeInstanceOf(AlreadyAMember);
  await expect(concept.invite({ inviter: "other", group, invitee: "new" })).rejects.toBeInstanceOf(NotAMember);
  const declined = await concept.invite({ inviter: "amy", group, invitee: "sarah" });
  await concept.decline({ invitee: "sarah", invitation: declined.invitation });
  await expect(concept.accept({ invitee: "sarah", invitation: declined.invitation })).rejects.toBeInstanceOf(NoSuchInvitation);
  await concept.leave({ user: "amy", group });
  await concept.leave({ user: "rebecca", group });
  expect(await concept._members({ group })).toEqual([]);
  expect(await concept._get({ group })).toHaveLength(1);
  const restored = new MembershipTrackingConcept(db);
  expect(await restored._get({ group })).toHaveLength(1);
  expect(await restored._groups({ user: "amy" })).toEqual([]);
  expect(await restored._membership({ user: "amy", group })).toEqual({ member: false });
  await expect(concept.leave({ user: "amy", group })).rejects.toBeInstanceOf(NotAMember);
  await expect(concept.leave({ user: "amy", group: "missing" })).rejects.toBeInstanceOf(NoSuchGroup);
  await expect(concept.create({ creator: "amy", name: " " })).rejects.toBeInstanceOf(InvalidName);
});
test("concurrent invitations and accept/decline preserve membership invariants", async () => {
  const concept = new MembershipTrackingConcept(db);
  const { group } = await concept.create({ creator: "host", name: "Concurrent" });
  const results = await Promise.allSettled([
    concept.invite({ inviter: "host", group, invitee: "guest" }),
    concept.invite({ inviter: "host", group, invitee: "guest" }),
  ]);
  expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  const { invitation } = (await concept._invitations({ invitee: "guest" }))[0]!;
  const answers = await Promise.allSettled([
    concept.accept({ invitee: "guest", invitation }), concept.decline({ invitee: "guest", invitation }),
  ]);
  expect(answers.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  expect(await concept._invitation({ invitation })).toEqual([]);
});
});

describe("MembershipTracking specification coverage", () => {
  test("unknown queries return empty rows or false, and unknown actions refuse", async () => {
    const concept = new MembershipTrackingConcept(db);
    expect(await concept._groups({ user: "unknown" })).toEqual([]);
    expect(await concept._get({ group: "unknown" })).toEqual([]);
    expect(await concept._members({ group: "unknown" })).toEqual([]);
    expect(await concept._membership({ user: "unknown", group: "unknown" })).toEqual({ member: false });
    expect(await concept._invitations({ invitee: "unknown" })).toEqual([]);
    expect(await concept._invitation({ invitation: "unknown" })).toEqual([]);
    await expect(concept.invite({ inviter: "amy", group: "unknown", invitee: "sarah" })).rejects.toBeInstanceOf(NoSuchGroup);
    await expect(concept.accept({ invitee: "amy", invitation: "unknown" })).rejects.toBeInstanceOf(NoSuchInvitation);
    await expect(concept.decline({ invitee: "amy", invitation: "unknown" })).rejects.toBeInstanceOf(NoSuchInvitation);
  });

  test("groups sort by name then identity and invitations sort by identity", async () => {
    const ids = ["group-z", "group-b", "group-a", "invitation-z", "invitation-a"];
    const concept = new MembershipTrackingConcept(db, () => ids.shift()!);
    await concept.create({ creator: "host", name: "Zebra" });
    await concept.create({ creator: "host", name: "Alpha" });
    await concept.create({ creator: "host", name: "Alpha" });
    await concept.invite({ inviter: "host", group: "group-z", invitee: "guest" });
    await concept.invite({ inviter: "host", group: "group-a", invitee: "guest" });
    const reopened = new MembershipTrackingConcept(db);
    expect(await reopened._groups({ user: "host" })).toEqual([
      { group: "group-a", name: "Alpha" }, { group: "group-b", name: "Alpha" }, { group: "group-z", name: "Zebra" },
    ]);
    expect(await reopened._invitations({ invitee: "guest" })).toEqual([
      { invitation: "invitation-a", group: "group-a", inviter: "host" },
      { invitation: "invitation-z", group: "group-z", inviter: "host" },
    ]);
  });

  test("wrong-recipient refusals preserve an invitation; decline permits reinviting", async () => {
    const concept = new MembershipTrackingConcept(db);
    const { group } = await concept.create({ creator: "host", name: "Friends" });
    const { invitation } = await concept.invite({ inviter: "host", group, invitee: "guest" });
    const expected = [{ invitation, group, inviter: "host", invitee: "guest" }];
    await expect(concept.accept({ invitee: "stranger", invitation })).rejects.toBeInstanceOf(NotInvited);
    await expect(concept.decline({ invitee: "stranger", invitation })).rejects.toBeInstanceOf(NotInvited);
    expect(await concept._invitation({ invitation })).toEqual(expected);
    expect(await concept._members({ group })).toEqual([{ user: "host" }]);
    await concept.decline({ invitee: "guest", invitation });
    const second = await concept.invite({ inviter: "host", group, invitee: "guest" });
    await concept.accept({ invitee: "guest", invitation: second.invitation });
    const reopened = new MembershipTrackingConcept(db);
    expect(await reopened._membership({ user: "guest", group })).toEqual({ member: true });
    expect(await reopened._invitations({ invitee: "guest" })).toEqual([]);
    await concept.leave({ user: "guest", group });
    const third = await concept.invite({ inviter: "host", group, invitee: "guest" });
    await concept.accept({ invitee: "guest", invitation: third.invitation });
    expect(await concept._members({ group })).toEqual([{ user: "guest" }, { user: "host" }]);
  });
});

