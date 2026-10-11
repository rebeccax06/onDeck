import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { ExperiencingConcept, AlreadyCompleted, NotCompleted, InvalidPreference, type RepeatPreference } from "../../src/concepts/Experiencing.ts";

const url = process.env.MONGODB_TEST_URL || process.env.MONGODB_URL;
if (!url) throw new Error("Set MONGODB_TEST_URL or MONGODB_URL to run persistence tests.");
const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
let db: Db;
beforeAll(async () => { await client.connect(); });
beforeEach(() => { db = client.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`); });
afterEach(async () => { await db.dropDatabase(); });
afterAll(async () => { await client.close(); });


describe("Experiencing with MongoDB", () => {
test("experiencing remembers completion and repeat preference independently", async () => {
  const concept = new ExperiencingConcept(db);
  const { experience } = await concept.complete({ user: "maya", item: "coffee" });
  expect(await concept._get({ user: "maya", item: "coffee" })).toEqual([{ experience, repeatPreference: "UNKNOWN" }]);
  await concept.setRepeatPreference({ user: "maya", item: "coffee", preference: "YES" });
  expect(await new ExperiencingConcept(db)._forItem({ item: "coffee" })).toEqual([{ experience, user: "maya", repeatPreference: "YES" }]);
  await concept.setRepeatPreference({ user: "maya", item: "coffee", preference: "NO" });
  await expect(concept.complete({ user: "maya", item: "coffee" })).rejects.toBeInstanceOf(AlreadyCompleted);
  await expect(concept.setRepeatPreference({ user: "maya", item: "coffee", preference: "bad" as RepeatPreference })).rejects.toBeInstanceOf(InvalidPreference);
  await concept.undoCompletion({ user: "maya", item: "coffee" });
  expect(await concept._get({ user: "maya", item: "coffee" })).toEqual([]);
  await expect(concept.undoCompletion({ user: "maya", item: "coffee" })).rejects.toBeInstanceOf(NotCompleted);
  await expect(concept.setRepeatPreference({ user: "maya", item: "coffee", preference: "YES" })).rejects.toBeInstanceOf(NotCompleted);
  const results = await Promise.allSettled([
    concept.complete({ user: "maya", item: "race" }), concept.complete({ user: "maya", item: "race" }),
  ]);
  expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
});
});

describe("Experiencing specification coverage", () => {
  test("preferences can reset to UNKNOWN; invalid preferences preserve stored state", async () => {
    const concept = new ExperiencingConcept(db);
    const { experience } = await concept.complete({ user: "amy", item: "coffee" });
    for (const preference of ["YES", "NO", "UNKNOWN"] as const) {
      await concept.setRepeatPreference({ user: "amy", item: "coffee", preference });
      // Repeating the same valid preference is allowed.
      await concept.setRepeatPreference({ user: "amy", item: "coffee", preference });
      expect(await new ExperiencingConcept(db)._get({ user: "amy", item: "coffee" })).toEqual([{ experience, repeatPreference: preference }]);
    }
    await expect(concept.setRepeatPreference({ user: "amy", item: "coffee", preference: "MAYBE" as RepeatPreference })).rejects.toBeInstanceOf(InvalidPreference);
    await expect(concept.setRepeatPreference({ user: "missing", item: "coffee", preference: "MAYBE" as RepeatPreference })).rejects.toBeInstanceOf(InvalidPreference);
    expect(await concept._get({ user: "amy", item: "coffee" })).toEqual([{ experience, repeatPreference: "UNKNOWN" }]);
  });

  test("experiences sort by user, stay independent, and can be recorded again after undo", async () => {
    const concept = new ExperiencingConcept(db);
    expect(await concept._get({ user: "unknown", item: "unknown" })).toEqual([]);
    expect(await concept._forItem({ item: "unknown" })).toEqual([]);
    const sarah = await concept.complete({ user: "sarah", item: "coffee" });
    const amy = await concept.complete({ user: "amy", item: "coffee" });
    const walk = await concept.complete({ user: "amy", item: "walk" });
    await concept.setRepeatPreference({ user: "amy", item: "coffee", preference: "YES" });
    expect(await new ExperiencingConcept(db)._forItem({ item: "coffee" })).toEqual([
      { experience: amy.experience, user: "amy", repeatPreference: "YES" },
      { experience: sarah.experience, user: "sarah", repeatPreference: "UNKNOWN" },
    ]);
    await concept.undoCompletion({ user: "amy", item: "coffee" });
    expect(await concept._get({ user: "amy", item: "coffee" })).toEqual([]);
    expect(await concept._get({ user: "amy", item: "walk" })).toEqual([{ experience: walk.experience, repeatPreference: "UNKNOWN" }]);
    expect(await concept._forItem({ item: "coffee" })).toEqual([{ experience: sarah.experience, user: "sarah", repeatPreference: "UNKNOWN" }]);
    const replacement = await concept.complete({ user: "amy", item: "coffee" });
    expect(replacement.experience).not.toBe(amy.experience);
    expect(await concept._get({ user: "amy", item: "coffee" })).toEqual([{ experience: replacement.experience, repeatPreference: "UNKNOWN" }]);
  });
});
