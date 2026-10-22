import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  MembershipTrackingConcept,
  InvalidLink,
  InvalidEmail,
  NotAMember,
  NotInvited,
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
    membership.createLink({ user: "stranger", group, recipient: "" }),
  ).rejects.toBeInstanceOf(NotAMember);
  await expect(
    membership.createLink({ user: "host", group, recipient: "bad" }),
  ).rejects.toBeInstanceOf(InvalidEmail);
  const { token, link } = await membership.createLink({
    user: "host",
    group,
    recipient: "",
  });
  expect(
    JSON.stringify(await db.collection("membershipTracking").findOne({})),
  ).not.toContain(token);
  expect(
    await new MembershipTrackingConcept(db)._link({ token }),
  ).toMatchObject([{ group, name: "Friends" }]);
  expect(await membership._membership({ user: "guest", group })).toEqual({
    member: false,
  });
  await membership.joinLink({ user: "guest", token, recipient: "" });
  await membership.joinLink({ user: "guest", token, recipient: "" });
  expect(await membership._members({ group })).toHaveLength(2);
  await expect(
    membership.revokeLink({ user: "stranger", group, link }),
  ).rejects.toBeInstanceOf(NotAMember);
  await membership.revokeLink({ user: "guest", group, link });
  await expect(
    membership.joinLink({ user: "late", token, recipient: "" }),
  ).rejects.toBeInstanceOf(InvalidLink);
  expect(await membership._link({ token })).toEqual([]);
});

test("email invitations require the verified recipient and concurrent acceptance consumes the link once", async () => {
  const membership = new MembershipTrackingConcept(db);
  const { group } = await membership.create({ creator: "host", name: "Email" });
  const { token } = await membership.createLink({
    user: "host",
    group,
    recipient: " New@Example.com ",
  });
  await expect(
    membership.joinLink({
      user: "wrong",
      token,
      recipient: "wrong@example.com",
    }),
  ).rejects.toBeInstanceOf(NotInvited);
  const results = await Promise.allSettled(
    ["new", "another"].map((user) =>
      membership.joinLink({ user, token, recipient: "new@example.com" }),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(await membership._members({ group })).toHaveLength(2);
  expect(await membership._link({ token })).toEqual([]);
});

test("expired links cannot be previewed or accepted, and an inviter leaving does not revoke a valid link", async () => {
  const membership = new MembershipTrackingConcept(db);
  const { group } = await membership.create({
    creator: "host",
    name: "Expiry",
  });
  const expired = await membership.createLink({
    user: "host",
    group,
    recipient: "",
  });
  await db
    .collection<{ _id: string }>("membershipTracking")
    .updateOne(
      { _id: group },
      { $set: { "links.$[link].expires": 1 } },
      { arrayFilters: [{ "link.link": expired.link }] },
    );
  expect(await membership._link({ token: expired.token })).toEqual([]);
  await expect(
    membership.joinLink({ user: "late", token: expired.token, recipient: "" }),
  ).rejects.toBeInstanceOf(InvalidLink);
  const valid = await membership.createLink({
    user: "host",
    group,
    recipient: "",
  });
  await membership.leave({ user: "host", group });
  expect(
    await membership.joinLink({
      user: "new",
      token: valid.token,
      recipient: "",
    }),
  ).toEqual({ group });
});
