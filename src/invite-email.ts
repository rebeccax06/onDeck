import { createClerkClient } from "@clerk/backend";
import type { MembershipTrackingConcept } from "./concepts/MembershipTracking.ts";

export class InviteEmailError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
export type EmailLookup = (email: string) => Promise<string | null>;
export type ResolveInvitee = (user: string, group: string, email: string) => Promise<string>;

export function clerkEmailLookup(secretKey: string): EmailLookup {
  const clerk = createClerkClient({ secretKey });
  return async email => {
    const { data } = await clerk.users.getUserList({ emailAddress: [email], limit: 100 });
    const account = data.find(account => account.emailAddresses.some(address =>
      address.emailAddress.toLowerCase() === email && address.verification?.status === "verified"));
    return account?.id ?? null;
  };
}

export function emailInviteResolver(
  membership: Pick<MembershipTrackingConcept, "_get" | "_membership">,
  lookup: EmailLookup,
): ResolveInvitee {
  return async (user, group, rawEmail) => {
    // Check access before looking up anyone's account.
    if (!(await membership._get({ group })).length) throw new InviteEmailError("NOT_FOUND", 404);
    if (!(await membership._membership({ user, group })).member) throw new InviteEmailError("FORBIDDEN", 403);
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InviteEmailError("INVALID_EMAIL", 400);
    const invitee = await lookup(email);
    if (!invitee) throw new InviteEmailError("FRIEND_NOT_FOUND", 404);
    return invitee;
  };
}
