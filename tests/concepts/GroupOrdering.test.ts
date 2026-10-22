import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  GroupOrderingConcept,
  InvalidOrder,
} from "../../src/concepts/GroupOrdering.ts";
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
test("personal order survives a new instance and cannot replace another user's order", async () => {
  const ordering = new GroupOrderingConcept(db);
  expect(await ordering._get({ user: "a" })).toEqual({ order: [] });
  await ordering.save({ user: "a", order: ["second", "first"] });
  await ordering.save({ user: "b", order: ["first", "second"] });
  expect(await new GroupOrderingConcept(db)._get({ user: "a" })).toEqual({
    order: ["second", "first"],
  });
  await expect(
    ordering.save({ user: "a", order: ["first", "first"] }),
  ).rejects.toBeInstanceOf(InvalidOrder);
  await expect(
    ordering.save({ user: "a", order: [""] }),
  ).rejects.toBeInstanceOf(InvalidOrder);
  expect(await ordering._get({ user: "a" })).toEqual({
    order: ["second", "first"],
  });
  await ordering.save({ user: "a", order: ["first", "second"] });
  await ordering.save({ user: "a", order: ["first", "second"] });
  expect(await ordering._get({ user: "a" })).toEqual({
    order: ["first", "second"],
  });
  await ordering.save({ user: "a", order: [] });
  expect(await ordering._get({ user: "a" })).toEqual({ order: [] });
  expect(await ordering._get({ user: "b" })).toEqual({
    order: ["first", "second"],
  });
});
