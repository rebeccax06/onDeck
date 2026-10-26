import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { bearerAuthenticator, createApiHandler } from "../../src/server.ts";
import { assembleApplication } from "../../src/assembly.ts";

const client = new MongoClient(
  process.env.MONGODB_TEST_URL || process.env.MONGODB_URL!,
  { serverSelectionTimeoutMS: 5000 },
);
let db: Db;
let app: ReturnType<typeof assembleApplication>;
beforeAll(async () => {
  await client.connect();
  db = client.db(`ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`);
  app = assembleApplication(db);
});
afterAll(async () => {
  if (app) await app.beginDrain();
  if (db) await db.dropDatabase();
  await client.close();
});

async function call(
  path: string,
  input: Record<string, unknown>,
  application = app,
): Promise<any> {
  const result = await application.invoker.invoke(path, input, {
    timeoutMs: 2500,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
async function refuses(
  path: string,
  input: Record<string, unknown>,
  code: string,
) {
  const result = await app.invoker.invoke(path, input, { timeoutMs: 2500 });
  expect(result).toMatchObject({
    ok: false,
    error: { kind: "domain", value: code },
  });
}
async function save(
  name: string,
  fields: Record<string, unknown> = {},
  user = "rebecca",
) {
  const { capture } = await call("/captures/start", {
    user,
    source: name,
  });
  return (
    await call("/captures/confirm", {
      user,
      capture,
      name,
      ...fields,
    })
  ).activity as string;
}

test("full journey: invitations, manual capture, sharing, heart, completion, repeat, and pick", async () => {
  expect(await call("/groups/list", { user: "new" })).toEqual({
    book: { groups: [] },
  });
  const { group } = await call("/groups/create", {
    user: "rebecca",
    name: "Roommates",
  });
  const { invitation } = await call("/groups/invite", {
    user: "rebecca",
    group,
    invitee: "amy",
  });
  expect(
    (await call("/invitations/list", { user: "amy" })).inbox.invitations[0],
  ).toMatchObject({ group, invitation, name: "Roommates" });
  await refuses(
    "/invitations/accept",
    { user: "other", invitation },
    "NOT_INVITED",
  );
  await call("/invitations/accept", { user: "amy", invitation });
  expect(
    (await call("/groups/get", { user: "amy", group })).page.members,
  ).toHaveLength(2);
  const secondInvite = await call("/groups/invite", {
    user: "amy",
    group,
    invitee: "sarah",
  });
  await call("/invitations/decline", {
    user: "sarah",
    invitation: secondInvite.invitation,
  });
  expect(
    (await call("/invitations/list", { user: "sarah" })).inbox.invitations,
  ).toEqual([]);
  const { capture } = await call("/captures/start", {
    user: "rebecca",
    source: "Coffee link",
  });
  expect(
    (await call("/captures/get", { user: "rebecca", capture })).preview.capture,
  ).toMatchObject({ capture, source: "Coffee link", proposal: null });
  await refuses("/captures/get", { user: "amy", capture }, "NOT_CAPTURE_OWNER");
  const { activity } = await call("/captures/confirm", {
    user: "rebecca",
    capture,
    name: "Coffee",
    cost: 6,
    currency: "USD",
    category: "Cafe",
    location: "Cambridge",
  });
  const { suggestion } = await call("/activities/add-to-group", {
    user: "rebecca",
    group,
    activity,
  });
  expect(
    await app.concepts.Wanting._wants({ user: "rebecca", item: activity }),
  ).toEqual({ wanted: true });
  await call("/activities/want", { user: "amy", group, activity });
  const page = (await call("/activities/get", { user: "amy", group, activity }))
    .page.activity;
  expect(page.interestedMembers).toEqual(["amy", "rebecca"]);
  expect(page.members).toHaveLength(2);
  await call("/activities/unwant", { user: "amy", group, activity });
  await call("/activities/want", { user: "amy", group, activity });
  await call("/activities/complete", { user: "amy", group, activity });
  expect(
    await app.concepts.Wanting._wants({ user: "amy", item: activity }),
  ).toEqual({ wanted: false });
  await call("/activities/repeat-preference", {
    user: "amy",
    group,
    activity,
    preference: "YES",
  });
  expect(
    await app.concepts.Wanting._wants({ user: "amy", item: activity }),
  ).toEqual({ wanted: true });
  const picked = (
    await call("/pick/options", {
      user: "rebecca",
      group,
      participants: ["amy", "rebecca", "amy"],
      maxCost: 10,
      currency: "USD",
      category: " cafe ",
      location: "bridge",
    })
  ).book.result;
  expect(picked.participants).toEqual(["amy", "rebecca"]);
  expect(picked.options[0]).toMatchObject({
    activity,
    wantedCount: 2,
    wantedWithoutCompletionCount: 1,
    completedCount: 1,
    repeatYesCount: 1,
  });
  expect(
    (
      await call("/pick/options", {
        user: "amy",
        group,
        participants: ["amy"],
        maxCost: 5,
        currency: "USD",
      })
    ).book.result.options,
  ).toEqual([]);
  await call("/activities/repeat-preference", {
    user: "amy",
    group,
    activity,
    preference: "NO",
  });
  expect(
    await app.concepts.Wanting._wants({ user: "amy", item: activity }),
  ).toEqual({ wanted: false });
  await call("/activities/undo-completion", { user: "amy", group, activity });
  expect(
    await app.concepts.Experiencing._get({ user: "amy", item: activity }),
  ).toEqual([]);
  await refuses(
    "/activities/withdraw",
    { user: "amy", suggestion },
    "NOT_SUGGESTER",
  );
  await call("/groups/leave", { user: "amy", group });
  expect(
    (await call("/activities/list", { user: "rebecca", group })).book
      .activities[0].members,
  ).toHaveLength(1);
  await call("/activities/withdraw", { user: "rebecca", suggestion });
  expect(
    (await call("/activities/list", { user: "rebecca", group })).book
      .activities,
  ).toEqual([]);
  expect(
    await app.concepts.Wanting._wants({ user: "rebecca", item: activity }),
  ).toEqual({ wanted: true });
  const abandoned = await call("/captures/start", {
    user: "rebecca",
    source: "Discard",
  });
  await call("/captures/discard", {
    user: "rebecca",
    capture: abandoned.capture,
  });
  await refuses(
    "/captures/get",
    { user: "rebecca", capture: abandoned.capture },
    "NO_SUCH_CAPTURE",
  );
});

test("access and input failures have explicit responses and no side effects", async () => {
  const { group } = await call("/groups/create", {
    user: "rebecca",
    name: "Private",
  });
  const activity = await save("Private activity");
  await refuses(
    "/groups/get",
    { user: "amy", group: "missing" },
    "NO_SUCH_GROUP",
  );
  await refuses("/groups/get", { user: "amy", group }, "NOT_A_MEMBER");
  await refuses(
    "/activities/add-to-group",
    { user: "amy", group, activity },
    "NOT_A_MEMBER",
  );
  await refuses(
    "/activities/want",
    { user: "rebecca", group, activity },
    "ACTIVITY_NOT_IN_GROUP",
  );
  await refuses(
    "/activities/get",
    { user: "rebecca", group, activity: "missing" },
    "NO_SUCH_ACTIVITY",
  );
  await refuses(
    "/activities/withdraw",
    { user: "rebecca", suggestion: "missing" },
    "NO_SUCH_SUGGESTION",
  );
  await refuses(
    "/pick/options",
    { user: "rebecca", group, participants: [] },
    "NO_PARTICIPANTS",
  );
  await refuses(
    "/pick/options",
    { user: "rebecca", group, participants: ["other"] },
    "INVALID_PARTICIPANTS",
  );
  await refuses(
    "/pick/options",
    { user: "rebecca", group, participants: ["rebecca"], maxCost: 2 },
    "INVALID_FILTERS",
  );
  await refuses(
    "/pick/options",
    {
      user: "rebecca",
      group,
      participants: ["rebecca"],
      from: "2026-10-10T12:00:00Z",
      until: "2026-10-09T12:00:00Z",
    },
    "INVALID_FILTERS",
  );
  expect(await app.concepts.Suggesting._forGroup({ group })).toEqual([]);
  const malformed = await app.invoker.invoke("/groups/get", {
    user: "amy",
    group: 42,
  });
  expect(malformed).toMatchObject({
    ok: false,
    error: { kind: "framework", code: "INVALID_INPUT" },
  });
});

test("Pick for Now ranks interest then novelty and applies inclusive dates and known budgets", async () => {
  const { group } = await call("/groups/create", {
    user: "rebecca",
    name: "Options",
  });
  const newest = await save("New", {
    cost: 0,
    currency: "USD",
    dateTime: "2026-10-10T12:00:00Z",
  });
  const repeat = await save("Repeat", {
    cost: 10,
    currency: "USD",
    dateTime: "2026-10-10T12:00:00Z",
  });
  const unknown = await save("Unknown budget");
  for (const activity of [repeat, unknown, newest])
    await call("/activities/add-to-group", {
      user: "rebecca",
      group,
      activity,
    });
  await call("/activities/complete", {
    user: "rebecca",
    group,
    activity: repeat,
  });
  await call("/activities/repeat-preference", {
    user: "rebecca",
    group,
    activity: repeat,
    preference: "YES",
  });
  const { options } = (
    await call("/pick/options", {
      user: "rebecca",
      group,
      participants: ["rebecca"],
      maxCost: 10,
      currency: "USD",
      from: "2026-10-10T12:00:00Z",
      until: "2026-10-10T12:00:00Z",
    })
  ).book.result;
  expect(options.map((row: any) => row.activity)).toEqual([
    newest,
    unknown,
    repeat,
  ]);
  expect(
    await app.concepts.Experiencing._get({ user: "rebecca", item: newest }),
  ).toEqual([]);
});

test("optional extraction proposes details; unsupported, invalid, and failed extraction stay manual", async () => {
  const extractedApp = assembleApplication(db, async (source) => {
    if (source === "bad") throw new Error("offline");
    if (source === "invalid") return { name: " ", cost: -1, currency: "USD" };
    return source === "supported"
      ? { name: "Extracted", cost: 3, currency: "USD" }
      : null;
  });
  for (const source of ["supported", "unsupported", "bad", "invalid"]) {
    const { capture } = await call(
      "/captures/start",
      { user: "rebecca", source },
      extractedApp,
    );
    const proposal = await extractedApp.concepts.ActivityCapturing._proposal({
      capture,
    });
    if (source === "supported")
      expect(proposal).toEqual([
        { name: "Extracted", cost: 3, currency: "USD" },
      ]);
    else expect(proposal).toEqual([]);
  }
  await extractedApp.beginDrain();
});

test("HTTP host supplies identity and exposes public status categories", async () => {
  const handler = createApiHandler(
    app,
    bearerAuthenticator({ "rebecca-token": "rebecca", "amy-token": "amy" }),
  );
  const post = (path: string, value: unknown, token?: string) =>
    handler(
      new Request(`http://localhost/api${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(value),
      }),
    );
  const unauthenticated = await post("/groups/list", { user: "rebecca" });
  expect(unauthenticated.status).toBe(401);
  const created = await post(
    "/groups/create",
    { user: "amy", name: "Host authenticated" },
    "rebecca-token",
  );
  expect(created.status).toBe(200);
  const { group } = (await created.json()) as { group: string };
  expect(await app.concepts.MembershipTracking._members({ group })).toEqual([
    { user: "rebecca" },
  ]);
  const forbidden = await post(
    "/groups/get",
    { user: "rebecca", group },
    "amy-token",
  );
  expect(forbidden.status).toBe(403);
  expect(await forbidden.json()).toEqual({ error: "FORBIDDEN" });
  expect(
    (await post("/groups/get", { group: "missing" }, "amy-token")).status,
  ).toBe(404);
  expect(
    (await post("/groups/create", { name: " " }, "amy-token")).status,
  ).toBe(400);
  expect((await post("/groups/get", { group: 42 }, "amy-token")).status).toBe(
    400,
  );
  expect(
    (await post("/groups/get", { group, unexpected: true }, "rebecca-token"))
      .status,
  ).toBe(400);
  const oversized = await post(
    "/captures/start",
    { source: "x".repeat(1_048_577) },
    "rebecca-token",
  );
  expect(oversized.status).toBe(400);
  expect(created.headers.get("Cache-Control")).toBe("no-store");
});

test("Pick for Now returns at most ten options and does not equate unknown costs with free", async () => {
  const { group } = await call("/groups/create", {
    user: "rebecca",
    name: "Ten options",
  });
  for (let i = 0; i < 12; i++) {
    const activity = await save(
      `Option ${String(i).padStart(2, "0")}`,
      i === 0 ? { cost: 0, currency: "USD" } : {},
    );
    await call("/activities/add-to-group", {
      user: "rebecca",
      group,
      activity,
    });
  }
  const all = (
    await call("/pick/options", {
      user: "rebecca",
      group,
      participants: ["rebecca"],
    })
  ).book.result;
  expect(all.options).toHaveLength(10);
  expect(all.options[0].name).toBe("Option 00");
  const free = (
    await call("/pick/options", {
      user: "rebecca",
      group,
      participants: ["rebecca"],
      maxCost: 0,
      currency: "USD",
    })
  ).book.result;
  expect(free.options).toHaveLength(10);
  expect(free.options[0].unknownFilters).toEqual([]);
  expect(free.options[1].unknownFilters).toEqual(["Cost"]);
  await refuses(
    "/pick/options",
    {
      user: "rebecca",
      group,
      participants: ["rebecca"],
      from: "2026-02-30T12:00:00Z",
    },
    "INVALID_FILTERS",
  );
});

test("repeat NO clears only that person's heart across groups and remains safe when already off", async () => {
  const user = "repeat-no-user",
    other = "repeat-other-user";
  const { group } = await call("/groups/create", {
    user,
    name: "Repeat choices",
  });
  const { invitation } = await call("/groups/invite", {
    user,
    group,
    invitee: other,
  });
  await call("/invitations/accept", { user: other, invitation });
  const second = await call("/groups/create", { user, name: "Other group" });
  const activity = await save("Shared repeat choice", {}, user);
  for (const target of [group, second.group])
    await call("/activities/add-to-group", { user, group: target, activity });
  await call("/activities/want", { user: other, group, activity });
  await call("/activities/complete", { user, group, activity });
  await call("/activities/repeat-preference", {
    user,
    group,
    activity,
    preference: "YES",
  });
  await call("/activities/repeat-preference", {
    user,
    group,
    activity,
    preference: "UNKNOWN",
  });
  expect(await app.concepts.Wanting._wants({ user, item: activity })).toEqual({
    wanted: true,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await call("/activities/repeat-preference", {
      user,
      group,
      activity,
      preference: "NO",
    });
    expect(await app.concepts.Wanting._wants({ user, item: activity })).toEqual(
      { wanted: false },
    );
  }
  for (const target of [group, second.group]) {
    const page = (
      await call("/activities/get", { user, group: target, activity })
    ).page.activity;
    expect(page.interestedMembers).not.toContain(user);
    expect(
      page.members.find((member: { user: string }) => member.user === user),
    ).toMatchObject({ completed: true, repeatPreference: "NO", wanted: false });
  }
  expect(
    await app.concepts.Wanting._wants({ user: other, item: activity }),
  ).toEqual({ wanted: true });
  await call("/activities/repeat-preference", {
    user,
    group,
    activity,
    preference: "YES",
  });
  expect(await app.concepts.Wanting._wants({ user, item: activity })).toEqual({
    wanted: true,
  });
});

test("sharing requires ownership or current source-group access; refusals do not create wants", async () => {
  const owner = "sharing-owner",
    member = "sharing-member",
    stranger = "sharing-stranger";
  const source = (await call("/groups/create", { user: owner, name: "Source" }))
    .group;
  const destination = (
    await call("/groups/create", { user: stranger, name: "Destination" })
  ).group;
  const activity = await save("Private discovery", {}, owner);
  await refuses(
    "/activities/add-to-group",
    { user: stranger, group: destination, activity },
    "ACTIVITY_NOT_ACCESSIBLE",
  );
  expect(
    await app.concepts.Suggesting._forGroup({ group: destination }),
  ).toEqual([]);
  expect(
    await app.concepts.Wanting._wants({ user: stranger, item: activity }),
  ).toEqual({ wanted: false });
  await call("/activities/add-to-group", {
    user: owner,
    group: source,
    activity,
  });
  const { invitation } = await call("/groups/invite", {
    user: owner,
    group: source,
    invitee: member,
  });
  await call("/invitations/accept", { user: member, invitation });
  const target = (
    await call("/groups/create", { user: member, name: "Reshare" })
  ).group;
  const { suggestion } = await call("/activities/add-to-group", {
    user: member,
    group: target,
    activity,
  });
  await call("/activities/withdraw", { user: member, suggestion });
  await call("/activities/unwant", { user: member, group: source, activity });
  await call("/groups/leave", { user: member, group: source });
  await refuses(
    "/activities/add-to-group",
    { user: member, group: target, activity },
    "ACTIVITY_NOT_ACCESSIBLE",
  );
  await refuses(
    "/activities/complete",
    { user: member, group: source, activity },
    "NOT_A_MEMBER",
  );
  await refuses(
    "/activities/repeat-preference",
    { user: member, group: source, activity, preference: "YES" },
    "NOT_A_MEMBER",
  );
  expect(
    await app.concepts.Wanting._wants({ user: member, item: activity }),
  ).toEqual({ wanted: false });
  expect(
    await app.concepts.Experiencing._get({ user: member, item: activity }),
  ).toEqual([]);
});

test("members edit shared details without changing ownership, suggestions, or preferences", async () => {
  const owner = "edit-owner",
    member = "edit-member",
    outsider = "edit-outsider";
  const { group } = await call("/groups/create", {
    user: owner,
    name: "Editing",
  });
  const second = (
    await call("/groups/create", { user: owner, name: "Also shared" })
  ).group;
  const { invitation } = await call("/groups/invite", {
    user: owner,
    group,
    invitee: member,
  });
  await call("/invitations/accept", { user: member, invitation });
  const activity = await save("Original", { description: "Clear me" }, owner);
  const privateActivity = await save("Not suggested", {}, owner);
  for (const target of [group, second])
    await call("/activities/add-to-group", {
      user: owner,
      group: target,
      activity,
    });
  const suggestions = await app.concepts.Suggesting._forGroup({ group });
  await call("/activities/complete", { user: member, group, activity });
  const experience = await app.concepts.Experiencing._get({
    user: member,
    item: activity,
  });
  const input = {
    user: member,
    group,
    activity,
    name: "Edited by member",
    cost: 12,
    currency: "USD",
  };
  await refuses(
    "/activities/update",
    { ...input, user: outsider },
    "NOT_A_MEMBER",
  );
  await refuses(
    "/activities/update",
    { ...input, activity: privateActivity },
    "ACTIVITY_NOT_IN_GROUP",
  );
  await refuses(
    "/activities/update",
    { ...input, name: " " },
    "INVALID_DETAILS",
  );
  expect(
    (await app.concepts.ActivityCapturing._get({ activity }))[0]?.name,
  ).toBe("Original");
  await call("/activities/update", input);
  for (const target of [group, second]) {
    const page = (
      await call("/activities/get", { user: owner, group: target, activity })
    ).page.activity;
    expect(page).toMatchObject({
      name: "Edited by member",
      cost: 12,
      currency: "USD",
    });
    expect(page.description).toBeUndefined();
  }
  expect(await app.concepts.ActivityCapturing._owner({ activity })).toEqual([
    { owner },
  ]);
  expect(await app.concepts.Suggesting._forGroup({ group })).toEqual(
    suggestions,
  );
  expect(
    await app.concepts.Experiencing._get({ user: member, item: activity }),
  ).toEqual(experience);
  expect(
    await app.concepts.Wanting._wants({ user: member, item: activity }),
  ).toEqual({ wanted: false });
  await call("/groups/leave", { user: member, group });
  await refuses(
    "/activities/update",
    { ...input, name: "After leaving" },
    "NOT_A_MEMBER",
  );
  expect(
    (await app.concepts.ActivityCapturing._get({ activity }))[0]?.name,
  ).toBe("Edited by member");
});

test("filters retain unknown details and exclude known mismatches", async () => {
  const user = "uncertain-picker";
  const { group } = await call("/groups/create", {
    user,
    name: "Incomplete ideas",
  });
  const unknown = await save("Unknown details", {}, user);
  const match = await save(
    "Known match",
    {
      category: "Chill",
      location: "Cambridge",
      cost: 8,
      currency: "USD",
      dateTime: "2026-10-25T18:00:00Z",
    },
    user,
  );
  const mismatches = [
    { category: "Active" },
    { location: "Boston" },
    { cost: 11, currency: "USD" },
    { cost: 5, currency: "EUR" },
    { dateTime: "2026-10-26T18:00:00Z" },
  ];
  for (const fields of mismatches) {
    const activity = await save("Known mismatch", fields, user);
    await call("/activities/add-to-group", { user, group, activity });
  }
  for (const activity of [unknown, match])
    await call("/activities/add-to-group", { user, group, activity });
  const result = (
    await call("/pick/options", {
      user,
      group,
      participants: [user],
      category: " chill ",
      location: "Cambridge",
      maxCost: 10,
      currency: "USD",
      from: "2026-10-25T00:00:00Z",
      until: "2026-10-25T23:59:59Z",
    })
  ).book.result;
  expect(result.options.map((row: any) => row.activity)).toEqual([
    match,
    unknown,
  ]);
  expect(result.options[0].unknownFilters).toEqual([]);
  expect(result.options[1].unknownFilters).toEqual([
    "Category",
    "Location",
    "Cost",
    "Date",
  ]);
});
