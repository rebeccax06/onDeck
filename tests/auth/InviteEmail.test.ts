import { expect, test } from "bun:test";
import { emailInviteResolver, InviteEmailError } from "../../src/invite-email.ts";
const membership = {
  _get: async ({ group }: { group: string }) => group === "roommates" ? [{ group, name: "Roommates" }] : [],
  _membership: async ({ user }: { user: string }) => ({ member: user === "host" }),
};
test("email invites normalize whitespace and case, then return the stable account ID", async () => {
  let lookedUp = "";
  const resolve = emailInviteResolver(membership, async email => { lookedUp = email; return "user_friend"; });
  expect(await resolve("host", "roommates", " Friend@Example.COM ")).toBe("user_friend");
  expect(lookedUp).toBe("friend@example.com");
});
test("nonmembers and missing groups cannot look up email accounts", async () => {
  let lookedUp = false;
  const resolve = emailInviteResolver(membership, async () => { lookedUp = true; return "user_friend"; });
  await expect(resolve("other", "roommates", "friend@example.com")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  await expect(resolve("host", "missing", "friend@example.com")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  expect(lookedUp).toBe(false);
});
test("invalid email input never reaches Clerk", async () => {
  let lookedUp = false;
  const resolve = emailInviteResolver(membership, async () => { lookedUp = true; return "user_friend"; });
  for (const email of ["", "user_abc", "a@", "a b@example.com"]) {
    await expect(resolve("host", "roommates", email)).rejects.toMatchObject({ code: "INVALID_EMAIL", status: 400 });
  }
  expect(lookedUp).toBe(false);
});
test("unknown or unverified email produces a clear refusal", async () => {
  const resolve = emailInviteResolver(membership, async () => null);
  await expect(resolve("host", "roommates", "friend@example.com")).rejects.toMatchObject({ code: "FRIEND_NOT_FOUND", status: 404 });
});
test("provider failures are not mistaken for unknown accounts", async () => {
  const failure = new Error("offline");
  const resolve = emailInviteResolver(membership, async () => { throw failure; });
  await expect(resolve("host", "roommates", "friend@example.com")).rejects.toBe(failure);
  expect(failure).not.toBeInstanceOf(InviteEmailError);
});
