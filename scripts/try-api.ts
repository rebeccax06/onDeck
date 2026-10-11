import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { OnDeckWireHttp } from "../generated/wire.ts";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000/api";
const token = process.env.CLERK_SESSION_TOKEN;
const user = process.env.CLERK_USER_ID;
if (!token || !user) throw new Error("Set CLERK_SESSION_TOKEN and CLERK_USER_ID for a signed-in test account in your local environment. See README.md.");
const client = createHttpClient<OnDeckWireHttp>({ baseUrl, headers: { Authorization: `Bearer ${token}` } });
function answer<T extends object>(label: string, result: T): Exclude<T, { error: unknown }> {
  console.log(`${label}:`, result);
  if ("error" in result) throw new Error(`${label} failed: ${result.error}. Check your session, backend, and MongoDB.`);
  return result as Exclude<T, { error: unknown }>;
}

// Creates persistent demo data owned by the verified account. JSON cannot select an actor.
const { group } = answer("Create group", await client.groups.create({ user, name: "API demo friends" }));
const { capture } = answer("Start capture", await client.captures.start({ user, source: "Try a new coffee shop" }));
const { activity } = answer("Confirm activity", await client.captures.confirm({
  user, capture, name: "Coffee with friends", category: "Cafe", location: "Cambridge", cost: 6, currency: "USD",
}));
answer("Add to group", await client.activities["add-to-group"]({ user, group, activity }));
answer("Remove heart", await client.activities.unwant({ user, group, activity }));
answer("Heart again", await client.activities.want({ user, group, activity }));
answer("Record having done it", await client.activities.complete({ user, group, activity }));
answer("Would do it again", await client.activities["repeat-preference"]({ user, group, activity, preference: "YES" }));
const listed = answer("List activities", await client.activities.list({ user, group }));
for (const row of listed.book.activities) console.log(`${row.name}: wanted by ${row.interestedMembers.join(", ")}`);
const picked = answer("Pick for Now", await client.pick.options({ user, group, participants: [user], maxCost: 10, currency: "USD" }));
for (const option of picked.book.result.options) console.log(`Pick: ${option.name} — ${option.cost} ${option.currency}`);
console.log("Saved demo IDs:", { group, activity });
