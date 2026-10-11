import { expect, test } from "bun:test";
import { createPeopleHandler } from "../../src/people.ts";

const request = () => new Request("http://localhost/auth/people");
const membership = {
  _groups: async ({ user }: { user: string }) => user === "amy" ? [{ group: "roommates", name: "Roommates" }] : [],
  _members: async ({ group }: { group: string }) => group === "roommates" ? [{ user: "amy" }, { user: "sarah" }] : [],
  _invitations: async ({ invitee }: { invitee: string }) => invitee === "amy" ? [{ invitation: "invite", group: "friends", inviter: "rebecca" }] : [],
};

test("display names require authentication before any directory lookup", async () => {
  let called = false;
  const handler = createPeopleHandler(() => null, membership, async () => { called = true; return {}; });
  expect((await handler(request())).status).toBe(401);
  expect(called).toBe(false);
});

test("display names include only the caller, group members, and pending inviters", async () => {
  let lookedUp: string[] = [];
  const handler = createPeopleHandler(() => "amy", membership, async ids => {
    lookedUp = ids;
    return { amy: "Amy", sarah: "Sarah", rebecca: "Rebecca", stranger: "Private name" };
  });
  const response = await handler(request());
  expect(lookedUp).toEqual(["amy", "sarah", "rebecca"]);
  expect(await response.json()).toEqual({ names: { amy: "Amy", sarah: "Sarah", rebecca: "Rebecca" } });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test("missing profiles get a member label without exposing email addresses", async () => {
  const handler = createPeopleHandler(() => "user_abcdef", membership, async () => ({}));
  expect(await (await handler(request())).json()).toEqual({ names: { user_abcdef: "Member · abcdef" } });
});

test("directory failure has a retryable response without leaking provider details", async () => {
  const handler = createPeopleHandler(() => "amy", membership, async () => { throw new Error("Private provider error"); });
  const response = await handler(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "UNAVAILABLE" });
});
