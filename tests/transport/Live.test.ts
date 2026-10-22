import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "bun";
import { MongoClient, type Db } from "mongodb";
import { createLiveHub, type LiveSocketData } from "../../src/live.ts";
import { assembleApplication } from "../../src/assembly.ts";
import { bearerAuthenticator, createApiHandler } from "../../src/server.ts";
import { createSharingHandler } from "../../src/sharing.ts";
import {
  proxyWebSocket,
  proxySocketHandler,
  type ProxySocketData,
} from "../../web/ws-proxy.ts";

const mongo = new MongoClient(
  process.env.MONGODB_TEST_URL || process.env.MONGODB_URL!,
  { serverSelectionTimeoutMS: 3000 },
);
const origin = "http://frontend.test";
const authenticate = bearerAuthenticator({
  alice: "alice",
  bob: "bob",
  stranger: "stranger",
});
let db: Db,
  app: ReturnType<typeof assembleApplication>,
  backend: Server<LiveSocketData>,
  frontend: Server<ProxySocketData>;
const hub = createLiveHub(authenticate, [origin]);
const sockets: WebSocket[] = [];
beforeAll(async () => {
  await mongo.connect();
  db = mongo.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`);
  app = assembleApplication(db);
  const sharing = createSharingHandler(authenticate, app.concepts.MembershipTracking);
  const api = createApiHandler(app, authenticate, { changed: hub.changed });
  backend = Bun.serve<LiveSocketData>({
    port: 0,
    hostname: "127.0.0.1",
    websocket: hub.websocket,
    fetch: (request, server) => {
      const path = new URL(request.url).pathname;
      if (path === "/live") return hub.upgrade(request, server);
      if (path === "/live/ticket") return hub.ticket(request);
      if (path.startsWith("/sharing/")) return sharing(request);
      return api(request);
    },
  });
  frontend = Bun.serve<ProxySocketData>({
    port: 0,
    hostname: "127.0.0.1",
    websocket: proxySocketHandler,
    fetch: (request, server) => {
      if (new URL(request.url).pathname === "/live")
        return proxyWebSocket(request, server, backend.url.href);
      return fetch(
        new URL(new URL(request.url).pathname, backend.url),
        request,
      );
    },
  });
});
afterAll(async () => {
  for (const socket of sockets) socket.close();
  frontend?.stop(true);
  backend?.stop(true);
  if (app) await app.beginDrain();
  if (db) await db.dropDatabase();
  await mongo.close();
});
async function post(
  path: string,
  input: unknown,
  token = "alice",
  requestedOrigin = origin,
) {
  return fetch(new URL(path, frontend.url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: requestedOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}
async function api(path: string, input: unknown, token = "alice") {
  return (await post(`/api${path}`, input, token)).json() as Promise<
    Record<string, any>
  >;
}
async function ticket(user: string) {
  return (
    (await (await post("/live/ticket", {}, user)).json()) as { ticket: string }
  ).ticket;
}
const RuntimeWebSocket = WebSocket as unknown as {
  new (url: URL, options: Bun.WebSocketOptions): WebSocket;
};
function connect(key: string) {
  const url = new URL("/live", frontend.url);
  url.protocol = "ws:";
  url.searchParams.set("ticket", key);
  const socket = new RuntimeWebSocket(url, { headers: { Origin: origin } });
  sockets.push(socket);
  const messages: string[] = [];
  const waiters: Array<{ type: string; resolve: () => void }> = [];
  socket.onmessage = (event) => {
    const type = JSON.parse(String(event.data)).type as string;
    const index = waiters.findIndex((waiter) => waiter.type === type);
    if (index >= 0) waiters.splice(index, 1)[0]!.resolve();
    else messages.push(type);
  };
  return {
    socket,
    messages,
    next(type: string) {
      const index = messages.indexOf(type);
      if (index >= 0) {
        messages.splice(index, 1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`No ${type} received`)),
          2000,
        );
        waiters.push({
          type,
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
        });
      });
    },
  };
}

test("tickets require authentication and an allowed origin, and cannot be reused", async () => {
  expect((await post("/live/ticket", {}, "missing")).status).toBe(401);
  expect(
    (await post("/live/ticket", {}, "alice", "https://other.test")).status,
  ).toBe(403);
  const key = await ticket("alice");
  const connected = connect(key);
  await connected.next("ready");
  const reused = await fetch(new URL(`/live?ticket=${key}`, backend.url), {
    headers: { Origin: origin },
  });
  expect(reused.status).toBe(401);
  connected.socket.close();
});

test("real proxied sockets deliver settled cross-user changes, exclude strangers, and recover after reconnect", async () => {
  const alice = connect(await ticket("alice")),
    bob = connect(await ticket("bob")),
    stranger = connect(await ticket("stranger"));
  await Promise.all([
    alice.next("ready"),
    bob.next("ready"),
    stranger.next("ready"),
  ]);
  const { group } = await api("/groups/create", { name: "Friends" });
  await alice.next("changed");
  const { token } = await api("/groups/create-link", { group });
  await alice.next("changed");
  await api("/invitations/join-link", { token }, "bob");
  await Promise.all([alice.next("changed"), bob.next("changed")]);
  const { capture } = await api("/captures/start", { source: "Coffee" });
  await alice.next("changed");
  const { activity } = await api("/captures/confirm", {
    capture,
    name: "Coffee",
  });
  await alice.next("changed");
  await api("/activities/add-to-group", { group, activity });
  await Promise.all([alice.next("changed"), bob.next("changed")]);
  const read = () => api("/activities/list", { group }, "bob");
  expect((await read()).book.activities[0].interestedMembers).toEqual([
    "alice",
  ]);
  await api("/activities/complete", { group, activity });
  await bob.next("changed");
  expect((await read()).book.activities[0].interestedMembers).toEqual([]);
  expect((await read()).book.activities[0].completedMembers).toHaveLength(1);
  stranger.socket.send("ping");
  await stranger.next("pong");
  expect(stranger.messages).toEqual([]);
  bob.socket.close();
  await api("/activities/want", { group, activity });
  const reconnected = connect(await ticket("bob"));
  await reconnected.next("ready");
  expect((await read()).book.activities[0].interestedMembers).toEqual([
    "alice",
  ]);
  await api("/groups/leave", { group }, "bob");
  await reconnected.next("changed");
  expect(await read()).toEqual({ error: "FORBIDDEN" });
});

test("reusable links join members and group cards obey only the caller's saved order", async () => {
  const { group: first } = await api("/groups/create", { name: "Alpha" });
  const { group: second } = await api("/groups/create", { name: "Zebra" });
  const { token } = await api("/groups/create-link", { group: first });
  expect(await api("/invitations/join-link", { token }, "bob")).toEqual({ group: first });
  await api("/groups/order", { user: "bob", order: [second, first] });
  const cards = (await api("/groups/list", {})).book.groups;
  expect(cards.slice(0, 2).map((card: any) => card.group)).toEqual([
    second,
    first,
  ]);
  expect(cards[1].members).toEqual(["alice", "bob"]);
  expect(
    (await api("/groups/list", {}, "bob")).book.groups.map(
      (card: any) => card.group,
    ),
  ).toEqual([first]);
});

test("deleting a group requires membership, removes invitations, notifies members, and preserves shared activities", async () => {
  const { group } = await api("/groups/create", { name: "Delete me" });
  const { group: kept } = await api("/groups/create", { name: "Keep me" });
  const { token } = await api("/groups/create-link", { group });
  await api("/invitations/join-link", { token }, "bob");
  const anotherLink = await api("/groups/create-link", {
    group,
  });
  const { capture } = await api("/captures/start", { source: "A shared idea" });
  const { activity } = await api("/captures/confirm", {
    capture,
    name: "A shared idea",
  });
  await api("/activities/add-to-group", { group, activity });
  await api("/activities/add-to-group", { group: kept, activity });
  expect(await api("/groups/delete", { group }, "stranger")).toEqual({
    error: "FORBIDDEN",
  });
  expect(await app.concepts.MembershipTracking._get({ group })).toHaveLength(1);
  const bob = connect(await ticket("bob"));
  await bob.next("ready");
  expect(await api("/groups/delete", { group })).toEqual({ success: true });
  await bob.next("changed");
  expect(await api("/groups/get", { group }, "bob")).toEqual({
    error: "NOT_FOUND",
  });
  expect(await app.concepts.MembershipTracking._link({ token })).toEqual([]);
  expect(
    await app.concepts.MembershipTracking._link({ token: anotherLink.token }),
  ).toEqual([]);
  expect(
    (await api("/activities/list", { group: kept })).book.activities[0]
      .activity,
  ).toBe(activity);
  expect(
    await app.concepts.Wanting._wants({ user: "alice", item: activity }),
  ).toEqual({ wanted: true });
  expect(await api("/groups/delete", { group })).toEqual({
    error: "NOT_FOUND",
  });
  await api("/groups/leave", { group: kept });
  expect(await api("/groups/delete", { group: kept })).toEqual({
    error: "FORBIDDEN",
  });
});

test("members can rename and change group pictures; invalid or unauthorized edits preserve saved data", async () => {
  const { group } = await api("/groups/create", { name: "Original" });
  const cover =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNCkAAAAASUVORK5CYII=";
  expect(
    await api("/groups/update", { group, name: "Changed", cover }, "stranger"),
  ).toEqual({ error: "FORBIDDEN" });
  expect(await app.concepts.MembershipTracking._cover({ group })).toEqual({
    cover: null,
  });
  expect(
    await api("/groups/update", { group, name: " Picture group ", cover }),
  ).toEqual({ success: true });
  expect(await app.concepts.MembershipTracking._get({ group })).toEqual([
    { group, name: "Picture group" },
  ]);
  expect(
    (await api("/groups/list", {})).book.groups.find(
      (card: any) => card.group === group,
    ).cover,
  ).toBe(cover);
  expect(
    await api("/groups/update", {
      group,
      name: "Bad edit",
      cover: "data:image/svg+xml;base64,PHN2Zz4=",
    }),
  ).toEqual({ error: "INVALID_REQUEST" });
  expect(
    await api("/groups/update", {
      group,
      name: "Bad edit",
      cover: "data:image/png;base64,bm90LWFuLWltYWdl",
    }),
  ).toEqual({ error: "INVALID_REQUEST" });
  expect(
    await api("/groups/update", {
      group,
      name: "Bad edit",
      cover: "data:image/png;base64," + "a".repeat(350000),
    }),
  ).toEqual({ error: "INVALID_REQUEST" });
  expect(
    await api("/groups/update", { group, name: " ", cover: null }),
  ).toEqual({ error: "INVALID_REQUEST" });
  expect(await app.concepts.MembershipTracking._cover({ group })).toEqual({
    cover,
  });
  expect(await app.concepts.MembershipTracking._get({ group })).toEqual([
    { group, name: "Picture group" },
  ]);
  const reopened = assembleApplication(db);
  try {
    expect(
      await reopened.concepts.MembershipTracking._cover({ group }),
    ).toEqual({ cover });
  } finally {
    await reopened.beginDrain();
  }
  expect(
    await api("/groups/update", { group, name: "Picture group", cover: null }),
  ).toEqual({ success: true });
  expect(await app.concepts.MembershipTracking._cover({ group })).toEqual({
    cover: null,
  });
  expect(
    await api("/groups/update", {
      group: "missing",
      name: "No group",
      cover: null,
    }),
  ).toEqual({ error: "NOT_FOUND" });
});
