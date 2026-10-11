import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { SuggestingConcept, AlreadySuggested, NotSuggester, NoSuchSuggestion } from "../../src/concepts/Suggesting.ts";

const url = process.env.MONGODB_TEST_URL || process.env.MONGODB_URL;
if (!url) throw new Error("Set MONGODB_TEST_URL or MONGODB_URL to run persistence tests.");
const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
let db: Db;
beforeAll(async () => { await client.connect(); });
beforeEach(() => { db = client.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`); });
afterEach(async () => { await db.dropDatabase(); });
afterAll(async () => { await client.close(); });


describe("Suggesting with MongoDB", () => {
test("suggestions belong to groups and only their suggester can withdraw them", async () => {
  const concept = new SuggestingConcept(db);
  const { suggestion } = await concept.suggest({ user: "rebecca", group: "roommates", item: "coffee" });
  await concept.suggest({ user: "rebecca", group: "friends", item: "coffee" });
  await expect(concept.withdraw({ user: "amy", suggestion })).rejects.toBeInstanceOf(NotSuggester);
  await expect(concept.suggest({ user: "amy", group: "roommates", item: "coffee" })).rejects.toBeInstanceOf(AlreadySuggested);
  expect(await concept._get({ suggestion })).toEqual([{ suggestion, suggester: "rebecca", group: "roommates", item: "coffee" }]);
  await concept.withdraw({ user: "rebecca", suggestion });
  expect(await concept._contains({ group: "roommates", item: "coffee" })).toEqual({ suggested: false });
  expect(await new SuggestingConcept(db)._forGroup({ group: "friends" })).toHaveLength(1);
  await expect(concept.withdraw({ user: "rebecca", suggestion })).rejects.toBeInstanceOf(NoSuchSuggestion);
  await concept.suggest({ user: "amy", group: "roommates", item: "coffee" });
  const pair = await Promise.allSettled([
    concept.suggest({ user: "amy", group: "race", item: "coffee" }),
    concept.suggest({ user: "rebecca", group: "race", item: "coffee" }),
  ]);
  expect(pair.filter((row) => row.status === "fulfilled")).toHaveLength(1);
});
});

describe("Suggesting specification coverage", () => {
  test("empty queries, identity ordering, and refusals preserve group collections", async () => {
    const ids = ["suggestion-z", "suggestion-a", "rejected-duplicate"];
    const concept = new SuggestingConcept(db, () => ids.shift()!);
    expect(await concept._get({ suggestion: "unknown" })).toEqual([]);
    expect(await concept._forGroup({ group: "unknown" })).toEqual([]);
    expect(await concept._contains({ group: "friends", item: "coffee" })).toEqual({ suggested: false });
    await concept.suggest({ user: "amy", group: "friends", item: "coffee" });
    await concept.suggest({ user: "sarah", group: "friends", item: "walk" });
    const expected = [
      { suggestion: "suggestion-a", suggester: "sarah", item: "walk" },
      { suggestion: "suggestion-z", suggester: "amy", item: "coffee" },
    ];
    await expect(concept.suggest({ user: "sarah", group: "friends", item: "coffee" })).rejects.toBeInstanceOf(AlreadySuggested);
    await expect(concept.withdraw({ user: "sarah", suggestion: "suggestion-z" })).rejects.toBeInstanceOf(NotSuggester);
    const reopened = new SuggestingConcept(db);
    expect(await reopened._forGroup({ group: "friends" })).toEqual(expected);
    expect(await reopened._contains({ group: "friends", item: "coffee" })).toEqual({ suggested: true });
    await reopened.withdraw({ user: "amy", suggestion: "suggestion-z" });
    expect(await reopened._get({ suggestion: "suggestion-z" })).toEqual([]);
    expect(await reopened._forGroup({ group: "friends" })).toEqual([expected[0]!]);
  });
});

