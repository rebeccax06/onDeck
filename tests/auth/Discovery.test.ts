import { expect, test } from "bun:test";
import { createDiscoveryHandler, geminiRanker, rankDiscovery, serviceAccountCredentials } from "../../src/discovery.ts";

const result: any = { participants: ["member"], filters: {}, options: [
  { activity: "a", name: "Cafe", source: "private-url", description: "Quiet table", members: [{ user: "private-user" }], unknownFilters: ["Cost"] },
  { activity: "b", name: "Walk", members: [], unknownFilters: [] },
] };

test("Gemini uses project/location/model and sends no member identities or source URLs", async () => {
  let request: any;
  const ranker = geminiRanker({ GOOGLE_CLOUD_PROJECT: "test-project", GOOGLE_CLOUD_LOCATION: "global", GOOGLE_GENAI_MODEL: "test-model" }, async value => {
    request = value;
    return { text: JSON.stringify({ ranking: [{ activity: "b", reason: "Might suit a relaxed mood." }] }) };
  });
  const ranked = await rankDiscovery(result, "something chill", ranker);
  expect(request.model).toBe("test-model");
  expect(request.contents).toContain("something chill");
  expect(request.contents).not.toContain("private-url");
  expect(request.contents).not.toContain("private-user");
  expect(ranked.options.map(row => row.activity)).toEqual(["b", "a"]);
  expect(ranked.discovery.status).toBe("ranked");
  expect(ranked.options[1]!.unknownFilters).toEqual(["Cost"]);
});

test("unconfigured, failed, blocked, invented, and duplicate rankings preserve ordinary options", async () => {
  expect(geminiRanker({})).toBeNull();
  expect((await rankDiscovery(result, "chill", null)).discovery.status).toBe("unconfigured");
  for (const output of [null, {}, { ranking: [] }, { ranking: [{ activity: "invented", reason: "No" }] }, { ranking: [{ activity: "a", reason: "One" }, { activity: "a", reason: "Two" }] }]) {
    const ranked = await rankDiscovery(result, "chill", async () => output);
    expect(ranked.options).toEqual(result.options);
    expect(ranked.discovery.status).toBe("unavailable");
  }
  expect((await rankDiscovery(result, "chill", async () => { throw new Error("secret provider error"); })).discovery.status).toBe("unavailable");
});

test("host requires authentication, bounds inputs, supplies actor, and rechecks delayed access", async () => {
  let providerCalls = 0;
  const calls: any[] = [];
  let allowed = true;
  const app: any = { invoker: { invoke: async (path: string, input: any) => {
    calls.push({ path, input });
    if (!allowed) return { ok: false, error: { kind: "domain", value: "NOT_A_MEMBER" } };
    return { ok: true, value: { book: { result } } };
  } } };
  const post = (value: unknown) => new Request("http://localhost/discovery/options", { method: "POST", body: JSON.stringify(value) });
  const ranker = async () => { providerCalls++; return { ranking: [{ activity: "a", reason: "Could fit" }] }; };
  const handler = createDiscoveryHandler(app, () => "member", ranker);
  const unauthorized = createDiscoveryHandler(app, () => null, ranker);
  expect((await unauthorized(post({}))).status).toBe(401);
  expect(calls).toHaveLength(0);
  expect((await handler(post({ prompt: "x".repeat(501) }))).status).toBe(400);
  expect((await handler(post({ prompt: "x", padding: "x".repeat(9000) }))).status).toBe(400);
  const response = await handler(post({ user: "victim", group: "g", participants: ["member"], prompt: "chill" }));
  expect(response.status).toBe(200);
  expect(calls[0].input.user).toBe("member");
  expect(calls[0].input).not.toHaveProperty("prompt");
  expect(calls[1].path).toBe("/groups/get");
  allowed = false;
  expect((await handler(post({ group: "g", participants: ["member"], prompt: "chill" }))).status).toBe(403);
  expect(providerCalls).toBe(1);
  allowed = true;
  const revoked = createDiscoveryHandler(app, () => "member", async () => { allowed = false; return { ranking: [{ activity: "a", reason: "Could fit" }] }; });
  expect((await revoked(post({ group: "g", participants: ["member"], prompt: "chill" }))).status).toBe(403);
});


test("vague activity names retain selected people's likes and repeat signals without identities", async () => {
  const row = (user: string, wanted: boolean, completed: boolean, repeatPreference: string | null) => ({ user, wanted, completed, repeatPreference });
  const sparse: any = { participants: ["alice-private", "bob-private"], filters: {}, options: [
    { activity: "vague", name: "hello", members: [row("bob-private", true, true, "YES"), row("alice-private", true, false, null), row("outsider-private", true, false, null)] },
    { activity: "other", name: "Idea", members: [row("alice-private", false, true, "NO"), row("bob-private", false, true, "UNKNOWN")] },
  ] };
  let request: any;
  const ranker = geminiRanker({ GOOGLE_CLOUD_PROJECT: "test-project" }, async value => {
    request = value;
    return { text: JSON.stringify({ ranking: [{ activity: "vague", reason: "Both people want it; mood fit is uncertain with few details." }] }) };
  });
  const ranked = await rankDiscovery(sparse, "something chill", ranker);
  const candidates = JSON.parse(request.contents).candidates;
  expect(candidates[0].preferences).toEqual([
    { person: 2, wanted: true, completed: true, repeatPreference: "YES" },
    { person: 1, wanted: true, completed: false, repeatPreference: null },
  ]);
  expect(candidates[1].preferences).toEqual([
    { person: 1, wanted: false, completed: true, repeatPreference: "NO" },
    { person: 2, wanted: false, completed: true, repeatPreference: "UNKNOWN" },
  ]);
  expect(request.contents).not.toContain("private");
  expect(request.config.systemInstruction).toContain("unmarked wants");
  expect(request.config.systemInstruction).toContain("When names/descriptions are vague");
  expect(ranked.discovery.status).toBe("ranked");
  expect(ranked.options[0].activity).toBe("vague");
});


test("fallback diagnostics distinguish timeout, invalid output, and provider errors without content", async () => {
  const events: any[] = [];
  const report = (event: unknown) => { events.push(event); };
  const timed = await rankDiscovery(result, "secret prompt", async () => new Promise(() => {}), { timeoutMs: 1, report });
  expect(timed.discovery.failureReason).toBe("timeout");
  expect(timed.options).toEqual(result.options);
  const invalid = await rankDiscovery(result, "secret prompt", async () => ({ ranking: [{ activity: "unknown-private-id", reason: "secret response" }] }), { report });
  expect(invalid.discovery.failureReason).toBe("invalid_response");
  const provider = await rankDiscovery(result, "secret prompt", async () => { throw Object.assign(new Error("secret token and provider body"), { status: 429 }); }, { report });
  expect(provider.discovery.failureReason).toBe("provider_error");
  expect(events[2].providerStatus).toBe(429);
  expect(events.map(event => event.reason)).toEqual(["timeout", "invalid_response", "provider_error"]);
  expect(JSON.stringify(events)).not.toContain("secret");
  expect(JSON.stringify(events)).not.toContain("private");
});


test("environment-only service account credentials stay server-side and malformed values are nonfatal", async () => {
  const key = "-----BEGIN PRIVATE KEY-----\nTEST-ONLY-SECRET\n-----END PRIVATE KEY-----\n";
  const raw = JSON.stringify({ type: "service_account", client_email: "test@example.iam.gserviceaccount.com", private_key: key, token_uri: "https://untrusted.example/ignored" });
  expect(serviceAccountCredentials()).toBeUndefined();
  expect(serviceAccountCredentials(raw)).toEqual({ client_email: "test@example.iam.gserviceaccount.com", private_key: key });
  const escaped = JSON.stringify({ type: "service_account", client_email: "test@example.iam.gserviceaccount.com", private_key: key.replaceAll("\n", "\\n") });
  expect(serviceAccountCredentials(escaped)?.private_key).toBe(key);
  for (const invalid of ["secret-invalid-json", "null", "[]", JSON.stringify({ type: "authorized_user", client_email: "test@example.com", private_key: key }), JSON.stringify({ type: "service_account", client_email: "test@example.com", private_key: "not-a-key" })]) {
    expect(() => serviceAccountCredentials(invalid)).toThrow("Invalid GOOGLE_SERVICE_ACCOUNT_JSON");
    expect(geminiRanker({ GOOGLE_CLOUD_PROJECT: "test-project", GOOGLE_SERVICE_ACCOUNT_JSON: invalid })).toBeNull();
  }
  let request: any;
  const ranker = geminiRanker({ GOOGLE_CLOUD_PROJECT: "test-project", GOOGLE_SERVICE_ACCOUNT_JSON: raw }, async value => {
    request = value;
    return { text: JSON.stringify({ ranking: [{ activity: "a", reason: "Could fit" }] }) };
  });
  expect((await rankDiscovery(result, "chill", ranker)).discovery.status).toBe("ranked");
  expect(JSON.stringify(request)).not.toContain("TEST-ONLY-SECRET");
  expect(JSON.stringify(request)).not.toContain("private_key");
});
