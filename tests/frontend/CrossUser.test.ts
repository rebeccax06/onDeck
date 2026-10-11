import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { ref, watch, nextTick } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import { assembleApplication } from "../../src/assembly.ts";
import { bearerAuthenticator, createApiHandler } from "../../src/server.ts";
import type { OnDeckHttpContract } from "../../src/http-contract.ts";
import { answer, type Activity } from "../../web/api.ts";
import { createLiveRefresh } from "../../web/live-refresh.ts";

const mongo = new MongoClient(process.env.MONGODB_TEST_URL || process.env.MONGODB_URL!, { serverSelectionTimeoutMS: 5000 });
let db: Db;
let app: ReturnType<typeof assembleApplication>;
let handler: ReturnType<typeof createApiHandler>;
beforeAll(async () => {
  await mongo.connect();
  db = mongo.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`);
  app = assembleApplication(db);
  handler = createApiHandler(app, bearerAuthenticator({ alice: "alice", bob: "bob", stranger: "stranger" }));
});
afterAll(async () => { if (app) await app.beginDrain(); if (db) await db.dropDatabase(); await mongo.close(); });

function client(token: string) {
  return createHttpClient<OnDeckHttpContract>({
    baseUrl: "http://localhost/api",
    headers: { Authorization: `Bearer ${token}` },
    fetch: Object.assign((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init)), { preconnect: fetch.preconnect }),
  });
}

test("two typed HTTP clients share persisted hearts through reactive refresh, then lose access on leave", async () => {
  const alice = client("alice"), bob = client("bob"), stranger = client("stranger");
  expect((await answer(alice.groups.list({ user: "alice" }))).book.groups).toEqual([]);
  const { group } = await answer(alice.groups.create({ user: "alice", name: "Friends" }));
  const { invitation } = await answer(alice.groups.invite({ user: "alice", group, invitee: "bob" }));
  expect(await bob.activities.list({ user: "alice", group })).toEqual({ error: "FORBIDDEN" });
  await answer(bob.invitations.accept({ user: "bob", invitation }));
  const { capture } = await answer(alice.captures.start({ user: "alice", source: "Cafe idea" }));
  const { activity } = await answer(alice.captures.confirm({ user: "alice", capture, name: "Cafe", description: "Try together" }));
  await answer(alice.activities["add-to-group"]({ user: "alice", group, activity }));

  // Vue's real reactive refs observe snapshots from the production refresh controller.
  const activities = ref<Activity[]>([]);
  const draft = ref("An unfinished museum suggestion");
  const filters = ref({ location: "Cambridge" });
  const participants = ref(["alice", "bob"]);
  const renderedHearts: number[] = [];
  const stop = watch(activities, rows => renderedHearts.push(rows[0]?.interestedMembers.length ?? 0));
  let warning = "", offline = false;
  const live = createLiveRefresh(async () => {
    if (offline) throw new Error("connection interrupted");
    return (await answer(alice.activities.list({ user: "alice", group }))).book.activities;
  }, rows => { activities.value = rows; warning = ""; }, () => { warning = "Retrying"; });
  try {
    await live.refresh(); await nextTick();
    expect(activities.value[0]?.interestedMembers).toEqual(["alice"]);
    // Spoofing Alice in JSON must still record Bob's authenticated identity.
    await answer(bob.activities.want({ user: "alice", group, activity }));
    offline = true;
    await live.refresh();
    expect(warning).toBe("Retrying");
    expect(activities.value[0]?.interestedMembers).toEqual(["alice"]);
    offline = false;
    await live.refresh(); await nextTick();
    expect(warning).toBe("");
    expect(activities.value[0]?.interestedMembers).toEqual(["alice", "bob"]);
    expect(renderedHearts).toEqual([1, 2]);
    expect(draft.value).toBe("An unfinished museum suggestion");
    expect(filters.value).toEqual({ location: "Cambridge" });
    expect(participants.value).toEqual(["alice", "bob"]);

    // A fresh assembly reads the same MongoDB state: this is not an in-memory fixture.
    const reopened = assembleApplication(db);
    try {
      expect(await reopened.concepts.Wanting._wants({ user: "bob", item: activity })).toEqual({ wanted: true });
      expect(await reopened.concepts.ActivityCapturing._get({ activity })).toMatchObject([{ name: "Cafe" }]);
    } finally { await reopened.beginDrain(); }
    expect(await stranger.activities.want({ user: "alice", group, activity })).toEqual({ error: "FORBIDDEN" });
    expect(await app.concepts.Wanting._wants({ user: "stranger", item: activity })).toEqual({ wanted: false });
    await answer(bob.groups.leave({ user: "bob", group }));
    expect(await bob.activities.list({ user: "alice", group })).toEqual({ error: "FORBIDDEN" });
    expect(await bob.activities.unwant({ user: "alice", group, activity })).toEqual({ error: "FORBIDDEN" });
    await live.refresh();
    expect(activities.value[0]?.interestedMembers).toEqual(["alice"]);
    expect(activities.value[0]?.members.map(m => m.user)).toEqual(["alice"]);
    expect(await app.concepts.Wanting._wants({ user: "bob", item: activity })).toEqual({ wanted: true });
  } finally { live.dispose(); stop(); }
});
