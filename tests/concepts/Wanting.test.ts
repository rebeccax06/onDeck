import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { WantingConcept, AlreadyWanted, NotWanted } from "../../src/concepts/Wanting.ts";

const url = process.env.MONGODB_TEST_URL || process.env.MONGODB_URL;
if (!url) throw new Error("Set MONGODB_TEST_URL or MONGODB_URL to run persistence tests.");
const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
let db: Db;
beforeAll(async () => { await client.connect(); });
beforeEach(() => { db = client.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`); });
afterEach(async () => { await db.dropDatabase(); });
afterAll(async () => { await client.close(); });


describe("Wanting with MongoDB", () => {
test("wanting is an independent per-person heart toggle with atomic duplicate protection", async () => {
  const concept = new WantingConcept(db);
  expect(await concept._wants({ user: "amy", item: "coffee" })).toEqual({ wanted: false });
  await concept.want({ user: "amy", item: "coffee" });
  await concept.want({ user: "sarah", item: "coffee" });
  await expect(concept.want({ user: "amy", item: "coffee" })).rejects.toBeInstanceOf(AlreadyWanted);
  expect(await concept._forItem({ item: "coffee" })).toEqual([{ user: "amy" }, { user: "sarah" }]);
  await concept.unwant({ user: "amy", item: "coffee" });
  expect(await new WantingConcept(db)._forUser({ user: "sarah" })).toEqual([{ item: "coffee" }]);
  await expect(concept.unwant({ user: "amy", item: "coffee" })).rejects.toBeInstanceOf(NotWanted);
  const results = await Promise.allSettled([
    concept.want({ user: "amy", item: "race" }), concept.want({ user: "amy", item: "race" }),
  ]);
  expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
});
test("simultaneous first wants for different items both persist", async () => {
  const concept = new WantingConcept(db);
  await Promise.all([
    concept.want({ user: "new-user", item: "one" }),
    concept.want({ user: "new-user", item: "two" }),
  ]);
  expect(await concept._forUser({ user: "new-user" })).toEqual([{ item: "one" }, { item: "two" }]);
});
});

describe("Wanting specification coverage", () => {
  test("hearts can toggle repeatedly without changing other users or items", async () => {
    const concept = new WantingConcept(db);
    expect(await concept._forUser({ user: "unknown" })).toEqual([]);
    expect(await concept._forItem({ item: "unknown" })).toEqual([]);
    await expect(concept.unwant({ user: "unknown", item: "coffee" })).rejects.toBeInstanceOf(NotWanted);
    await concept.want({ user: "sarah", item: "coffee" });
    await concept.want({ user: "amy", item: "walk" });
    await concept.want({ user: "amy", item: "coffee" });
    await expect(concept.want({ user: "amy", item: "coffee" })).rejects.toBeInstanceOf(AlreadyWanted);
    expect(await concept._forUser({ user: "amy" })).toEqual([{ item: "coffee" }, { item: "walk" }]);
    expect(await concept._forItem({ item: "coffee" })).toEqual([{ user: "amy" }, { user: "sarah" }]);
    for (let i = 0; i < 2; i++) {
      await concept.unwant({ user: "amy", item: "coffee" });
      expect(await concept._wants({ user: "amy", item: "coffee" })).toEqual({ wanted: false });
      await concept.want({ user: "amy", item: "coffee" });
    }
    const reopened = new WantingConcept(db);
    expect(await reopened._forUser({ user: "amy" })).toEqual([{ item: "coffee" }, { item: "walk" }]);
    expect(await reopened._forUser({ user: "sarah" })).toEqual([{ item: "coffee" }]);
  });
});

