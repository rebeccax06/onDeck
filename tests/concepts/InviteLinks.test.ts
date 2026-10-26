import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  MembershipTrackingConcept,
  InvalidLink,
  InvalidName,
  NotAMember,
} from "../../src/concepts/MembershipTracking.ts";
const client = new MongoClient(
  process.env.MONGODB_TEST_URL || process.env.MONGODB_URL!,
  { serverSelectionTimeoutMS: 3000 },
);
let db: Db;
beforeAll(async () => {
  await client.connect();
  db = client.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`);
});
afterAll(async () => {
  if (db) await db.dropDatabase();
  await client.close();
});

test("links store hashes, persist, permit explicit joining, and can be revoked", async () => {
  const membership = new MembershipTrackingConcept(db);
  const { group } = await membership.create({
    creator: "host",
    name: "Friends",
  });
  await expect(
    membership.createLink({ user: "stranger", group }),
  ).rejects.toBeInstanceOf(NotAMember);
  const { token, link } = await membership.createLink({
    user: "host",
    group,
  });
  expect(
    JSON.stringify(await db.collection<{ _id: string }>("membershipTracking").findOne({ _id: group })),
  ).not.toContain(token);
  expect(
    await new MembershipTrackingConcept(db)._link({ token }),
  ).toMatchObject([{ group, name: "Friends" }]);
  expect(await membership._membership({ user: "guest", group })).toEqual({
    member: false,
  });
  await membership.joinLink({ user: "guest", token });
  await membership.joinLink({ user: "guest", token });
  expect(await membership._members({ group })).toHaveLength(2);
  await expect(
    membership.revokeLink({ user: "stranger", group, link }),
  ).rejects.toBeInstanceOf(NotAMember);
  await membership.revokeLink({ user: "guest", group, link });
  await expect(
    membership.joinLink({ user: "late", token }),
  ).rejects.toBeInstanceOf(InvalidLink);
  expect(await membership._link({ token })).toEqual([]);
});

test("expired links cannot be previewed or accepted, and an inviter leaving does not revoke a valid link", async () => {
  let now = Date.now();
  const membership = new MembershipTrackingConcept(db, undefined, () => now);
  const { group } = await membership.create({
    creator: "host",
    name: "Expiry",
  });
  const expired = await membership.createLink({
    user: "host",
    group,
  });
  now = expired.expires - 1;
  expect(await membership._link({ token: expired.token })).toHaveLength(1);
  now = expired.expires;
  expect(await membership._link({ token: expired.token })).toEqual([]);
  await expect(
    membership.joinLink({ user: "late", token: expired.token }),
  ).rejects.toBeInstanceOf(InvalidLink);
  expect(await membership._membership({ user: "late", group })).toEqual({ member: false });
  expect(await membership._members({ group })).toEqual([{ user: "host" }]);
  const valid = await membership.createLink({
    user: "host",
    group,
  });
  await membership.leave({ user: "host", group });
  expect(
    await membership.joinLink({
      user: "new",
      token: valid.token,
    }),
  ).toEqual({ group });
});


test("link names are automatic, editable by members, and preserve token and expiry", async () => {
  let now = 1000;
  const membership = new MembershipTrackingConcept(db, () => crypto.randomUUID(), () => now);
  const { group } = await membership.create({ creator: "name-host", name: "Names" });
  const first = await membership.createLink({ user: "name-host", group });
  const second = await membership.createLink({ user: "name-host", group });
  const original = (await membership._links({ group })).find(row => row.link === first.link)!;
  expect(original.name).toBe("Invite link 1");
  await expect(membership.renameLink({ user: "outsider", group, link: first.link, name: "Stolen" })).rejects.toBeInstanceOf(NotAMember);
  for (const name of [" ", "x".repeat(81)]) {
    await expect(membership.renameLink({ user: "name-host", group, link: first.link, name })).rejects.toBeInstanceOf(InvalidName);
  }
  expect((await membership._links({ group })).find(row => row.link === first.link)).toEqual(original);
  await membership.joinLink({ user: "name-guest", token: first.token });
  await membership.renameLink({ user: "name-guest", group, link: first.link, name: "  Work friends  " });
  const saved = (await new MembershipTrackingConcept(db, undefined, () => now)._links({ group })).find(row => row.link === first.link)!;
  expect(saved).toEqual({ ...original, name: "Work friends" });
  expect((await membership._links({ group })).find(row => row.link === second.link)?.name).toBe("Invite link 2");
  expect(await membership.joinLink({ user: "new-guest", token: first.token })).toEqual({ group });
  await membership.revokeLink({ user: "name-host", group, link: second.link });
  await expect(membership.renameLink({ user: "name-host", group, link: second.link, name: "Revoked" })).rejects.toBeInstanceOf(InvalidLink);
  now = first.expires;
  await expect(membership.renameLink({ user: "name-host", group, link: first.link, name: "Expired" })).rejects.toBeInstanceOf(InvalidLink);
});


test("automatic invite names allocate distinct numbers concurrently and do not reuse revoked numbers", async () => {
  const membership = new MembershipTrackingConcept(db);
  const { group } = await membership.create({ creator: "counter-host", name: "Counter" });
  const created = await Promise.all(Array.from({ length: 3 }, () => membership.createLink({ user: "counter-host", group })));
  expect((await membership._links({ group })).map(row => row.name).sort()).toEqual(["Invite link 1", "Invite link 2", "Invite link 3"]);
  for (const { link } of created) await membership.revokeLink({ user: "counter-host", group, link });
  await membership.createLink({ user: "counter-host", group });
  expect((await membership._links({ group }))[0]?.name).toBe("Invite link 4");
});
