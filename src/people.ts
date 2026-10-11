import { createClerkClient } from "@clerk/backend";
import type { Authenticate } from "./server.ts";
import type { MembershipTrackingConcept } from "./concepts/MembershipTracking.ts";

export type NameLookup = (ids: string[]) => Promise<Record<string, string>>;
export function clerkNameLookup(secretKey: string): NameLookup {
  const clerk = createClerkClient({ secretKey });
  return async (ids) => {
    const names: Record<string, string> = {};
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { data } = await clerk.users.getUserList({ userId: ids.slice(offset, offset + 100), limit: 100 });
      for (const account of data) {
        names[account.id] = [account.firstName, account.lastName].filter(Boolean).join(" ").trim()
          || account.username || `Member · ${account.id.slice(-6)}`;
      }
    }
    return names;
  };
}

/** Host profile presentation; the caller cannot enumerate unrelated Clerk accounts. */
export function createPeopleHandler(authenticate: Authenticate, membership: Pick<MembershipTrackingConcept, "_groups" | "_members" | "_invitations">, lookup: NameLookup) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  return async (request: Request) => {
    if (request.method !== "GET") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
    try {
      const user = await authenticate(request);
      if (!user) return reply({ error: "UNAUTHORIZED" }, 401);
      const ids = new Set([user]);
      const groups = await membership._groups({ user });
      for (const { group } of groups) {
        for (const member of await membership._members({ group })) ids.add(member.user);
      }
      for (const invitation of await membership._invitations({ invitee: user })) ids.add(invitation.inviter);
      const names = await lookup([...ids]);
      // Whitelist results too: only names associated with accessible identities leave the host.
      return reply({ names: Object.fromEntries([...ids].map(id => [id, names[id] || `Member · ${id.slice(-6)}`])) });
    } catch { return reply({ error: "UNAVAILABLE" }, 503); }
  };
}
