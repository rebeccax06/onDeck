import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  ActivityCapturingConcept, EmptySource, InvalidDetails, NoSuchCapture, NotCaptureOwner,
} from "../../src/concepts/Concept.ts";

// A real MongoDB test database, unique to this run. Never drops the configured application database.
const url = process.env.MONGODB_TEST_URL || process.env.MONGODB_URL;
if (!url) throw new Error("Set MONGODB_TEST_URL or MONGODB_URL to run persistence tests.");
const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
let db: Db;
let concept: ActivityCapturingConcept;

beforeAll(async () => {
  await client.connect();
  db = client.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`);
  concept = new ActivityCapturingConcept(db);
});
afterAll(async () => {
  if (db) await db.dropDatabase();
  await client.close();
});

describe("ActivityCapturing with MongoDB", () => {
  test("principle: capture, propose, correct, confirm; survives a new concept instance", async () => {
    const { capture } = await concept.start({ user: "rebecca", source: " https://example.com/coffee " });
    expect(await concept._capture({ capture })).toEqual([
      { capture, owner: "rebecca", source: "https://example.com/coffee" },
    ]);
    expect(await concept._proposal({ capture })).toEqual([]);
    await concept.propose({ capture, name: "Coffee", cost: 6, currency: "USD", location: "Cambridge" });
    expect(await concept._proposal({ capture })).toEqual([
      { name: "Coffee", cost: 6, currency: "USD", location: "Cambridge" },
    ]);
    const { activity } = await concept.confirm({ user: "rebecca", capture, name: " Better Coffee ", cost: 5.50, currency: "USD" });
    expect(activity).not.toBe(capture);
    const reopened = new ActivityCapturingConcept(db);
    expect(await reopened._get({ activity })).toEqual([
      { activity, name: "Better Coffee", cost: 5.50, currency: "USD" },
    ]);
    expect(await reopened._capture({ capture })).toEqual([]);
    expect(await reopened._proposal({ capture })).toEqual([]);
    await expect(reopened.propose({ capture, name: "Late extraction" })).rejects.toBeInstanceOf(NoSuchCapture);
  });

  test("manual confirmation needs no proposal and does not invent missing fields", async () => {
    const { capture } = await concept.start({ user: "amy", source: "A walk" });
    const { activity } = await concept.confirm({ user: "amy", capture, name: "A walk" });
    expect(await concept._get({ activity })).toEqual([{ activity, name: "A walk" }]);
  });

  test("replacing a proposal clears omitted values without changing the original source", async () => {
    const { capture } = await concept.start({ user: "amy", source: "original" });
    await concept.propose({ capture, name: "First", source: "extracted", cost: 20, currency: "USD" });
    await concept.propose({ capture, name: " Second " });
    expect(await concept._proposal({ capture })).toEqual([{ name: "Second" }]);
    expect((await concept._capture({ capture }))[0]?.source).toBe("original");
  });

  test("ownership refusals preserve the capture and proposal", async () => {
    const { capture } = await concept.start({ user: "amy", source: "private" });
    await concept.propose({ capture, name: "Private idea" });
    await expect(concept.confirm({ user: "other", capture, name: "Stolen" })).rejects.toBeInstanceOf(NotCaptureOwner);
    await expect(concept.discard({ user: "other", capture })).rejects.toBeInstanceOf(NotCaptureOwner);
    expect(await concept._proposal({ capture })).toEqual([{ name: "Private idea" }]);
    await concept.discard({ user: "amy", capture });
    expect(await concept._capture({ capture })).toEqual([]);
    expect(await concept._proposal({ capture })).toEqual([]);
  });

  test("all unknown queries are empty and actions refuse before validating details", async () => {
    const capture = "missing";
    expect(await concept._capture({ capture })).toEqual([]);
    expect(await concept._proposal({ capture })).toEqual([]);
    expect(await concept._get({ activity: "missing" })).toEqual([]);
    await expect(concept.propose({ capture, name: "" })).rejects.toBeInstanceOf(NoSuchCapture);
    await expect(concept.confirm({ user: "amy", capture, name: "" })).rejects.toBeInstanceOf(NoSuchCapture);
    await expect(concept.discard({ user: "amy", capture })).rejects.toBeInstanceOf(NoSuchCapture);
    await expect(concept.start({ user: "amy", source: " \n " })).rejects.toBeInstanceOf(EmptySource);
  });

  test("invalid costs, currencies, names, and dates leave proposals unchanged", async () => {
    const { capture } = await concept.start({ user: "amy", source: "source" });
    await concept.propose({ capture, name: "Valid" });
    const cases = [
      { name: " " }, { cost: -1, currency: "USD" }, { cost: Infinity, currency: "USD" },
      { cost: NaN, currency: "USD" }, { cost: 3 }, { currency: "USD" },
      { cost: 1, currency: "usd" }, { cost: 1, currency: "ZZZ" },
      { cost: 1.001, currency: "USD" }, { cost: 1.1, currency: "JPY" },
      { dateTime: "2026-10-10T12:00:00" }, { dateTime: "2026-02-30T12:00:00Z" },
      { dateTime: "2026-10-10T25:00:00Z" },
    ];
    for (const fields of cases) {
      await expect(concept.propose({ capture, name: "Valid", ...fields })).rejects.toBeInstanceOf(InvalidDetails);
      await expect(concept.confirm({ user: "amy", capture, name: "Valid", ...fields })).rejects.toBeInstanceOf(InvalidDetails);
    }
    expect(await concept._proposal({ capture })).toEqual([{ name: "Valid" }]);
    await concept.propose({ capture, name: "Free", cost: 0, currency: "USD", dateTime: "2026-10-10T12:00:00-04:00" });
    expect((await concept._proposal({ capture }))[0]?.cost).toBe(0);
  });

  test("two concurrent confirmations have only one winner", async () => {
    const { capture } = await concept.start({ user: "amy", source: "one activity" });
    const results = await Promise.allSettled([
      concept.confirm({ user: "amy", capture, name: "One" }),
      concept.confirm({ user: "amy", capture, name: "Two" }),
    ]);
    const success = results.filter((result) => result.status === "fulfilled");
    const failure = results.filter((result) => result.status === "rejected");
    expect(success).toHaveLength(1);
    expect(failure).toHaveLength(1);
    expect(failure[0]?.reason).toBeInstanceOf(NoSuchCapture);
    expect(await concept._get({ activity: success[0]!.value.activity })).toHaveLength(1);
  });

  test("confirmation racing discard cannot resurrect a capture", async () => {
    const { capture } = await concept.start({ user: "amy", source: "race" });
    const results = await Promise.allSettled([
      concept.confirm({ user: "amy", capture, name: "Saved" }),
      concept.discard({ user: "amy", capture }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await concept._capture({ capture })).toEqual([]);
    expect(await concept._proposal({ capture })).toEqual([]);
  });
});

describe("ActivityCapturing specification coverage", () => {
  test("discarding one draft preserves other drafts and confirmed activities", async () => {
    const concept = new ActivityCapturingConcept(db);
    const abandoned = await concept.start({ user: "amy", source: "Discard me" });
    const pending = await concept.start({ user: "amy", source: "Keep me" });
    await concept.propose({ capture: pending.capture, name: "Pending idea" });
    const saved = await concept.start({ user: "amy", source: "Saved source" });
    const { activity } = await concept.confirm({ user: "amy", capture: saved.capture, name: "Saved idea" });
    await concept.discard({ user: "amy", capture: abandoned.capture });
    const reopened = new ActivityCapturingConcept(db);
    expect(await reopened._capture({ capture: abandoned.capture })).toEqual([]);
    expect(await reopened._capture({ capture: pending.capture })).toEqual([
      { capture: pending.capture, owner: "amy", source: "Keep me" },
    ]);
    expect(await reopened._proposal({ capture: pending.capture })).toEqual([{ name: "Pending idea" }]);
    expect(await reopened._get({ activity })).toEqual([{ activity, name: "Saved idea" }]);
    await expect(reopened.discard({ user: "amy", capture: saved.capture })).rejects.toBeInstanceOf(NoSuchCapture);
    expect(await reopened._get({ activity })).toEqual([{ activity, name: "Saved idea" }]);
  });
});

