import { expect, test } from "bun:test";
import { createSharingHandler } from "../../src/sharing.ts";

const request = (path: string, input: unknown, user = "member") => new Request(`http://app${path}`, {
  method: "POST", headers: { Authorization: user, "Content-Type": "application/json" }, body: JSON.stringify(input),
});
const membership = { _link: async ({ token }: { token: string }) => token === "secret" ? [{ group: "g", name: "Friends", link: "l" }] : [] };
const handler = createSharingHandler(req => req.headers.get("authorization"), membership);

test("invite previews require sign-in and expose only the group name", async () => {
  expect((await handler(request("/sharing/preview", { token: "secret" }, ""))).status).toBe(401);
  const response = await handler(request("/sharing/preview", { token: "secret" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ name: "Friends" });
  expect((await handler(request("/sharing/preview", { token: "missing" }))).status).toBe(404);
});
test("removed email routes are unavailable and never look up invitations", async () => {
  let reads = 0;
  const handler = createSharingHandler(() => "member", { _link: async () => { reads++; return []; } });
  for (const path of ["/sharing/email", "/sharing/inbox"]) expect((await handler(request(path, { token: "secret" }))).status).toBe(404);
  expect(reads).toBe(0);
});
test("invalid preview requests and provider failures return explicit errors", async () => {
  for (const input of [{}, { token: 5 }, { token: "" }, { token: "x".repeat(201) }])
    expect((await handler(request("/sharing/preview", input))).status).toBe(400);
  expect((await handler(new Request("http://app/sharing/preview"))).status).toBe(405);
  const unavailable = createSharingHandler(() => "member", { _link: async () => { throw new Error("storage unavailable"); } });
  expect(await (await unavailable(request("/sharing/preview", { token: "secret" }))).json()).toEqual({ error: "UNAVAILABLE" });
});
