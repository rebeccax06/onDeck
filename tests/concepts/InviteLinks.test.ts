import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  MembershipTrackingConcept,
  InvalidLink,
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
