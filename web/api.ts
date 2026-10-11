import type { OnDeckWireHttp } from "../generated/wire.ts";

export type Activity = OnDeckWireHttp["/activities/list"]["output"]["book"]["activities"][number];
export type Group = OnDeckWireHttp["/groups/list"]["output"]["book"]["groups"][number];
export type Invitation = OnDeckWireHttp["/invitations/list"]["output"]["inbox"]["invitations"][number];
export class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export async function answer<T>(call: Promise<T>): Promise<Exclude<T, { error: unknown }>> {
  const result = await call;
  if (result && typeof result === "object" && "error" in result) {
    const code = String(result.error);
    const explanation: Record<string, string> = {
      INVALID_EMAIL: "Enter a valid email address.",
      FRIEND_NOT_FOUND: "No account with that verified email was found. Ask your friend to create an OnDeck account first, then retry.",
      UNAVAILABLE: "The service is unavailable. Please retry shortly.",
      UNAUTHORIZED: "Your session has expired. Please sign in again.",
      HEADER_RESOLUTION_FAILED: "Could not refresh your session. Please sign out and sign in again.",
      FORBIDDEN: "You no longer have access to this group or item.",
      NOT_FOUND: "This group, activity, or invitation is no longer available.",
      CONFLICT: "This action was already recorded or the item changed. Your view will update automatically.",
      INVALID_REQUEST: "Check the required fields, budget and currency, and date range.",
      INTERNAL_ERROR: "Something went wrong on the server. Please try again.",
      NETWORK_ERROR: "Could not reach the server. Please retry.",
    };
    throw new ApiError(code, explanation[code] ?? code.replaceAll("_", " ").toLowerCase());
  }
  return result as Exclude<T, { error: unknown }>;
}
