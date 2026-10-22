import type { Authenticate } from "./server.ts";
import type { MembershipTrackingConcept } from "./concepts/MembershipTracking.ts";

/** Reveal only the group name for a valid invite token, after sign-in. */
export function createSharingHandler(authenticate: Authenticate, membership: Pick<MembershipTrackingConcept, "_link">) {
  return async (request: Request): Promise<Response> => {
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (new URL(request.url).pathname !== "/sharing/preview") return reply({ error: "NOT_FOUND" }, 404);
    if (request.method !== "POST") return reply({ error: "INVALID_REQUEST" }, 405);
    let user: string | null;
    try { user = await authenticate(request); } catch { return reply({ error: "UNAVAILABLE" }, 503); }
    if (!user) return reply({ error: "UNAUTHORIZED" }, 401);
    if (Number(request.headers.get("content-length")) > 4096) return reply({ error: "INVALID_REQUEST" }, 400);
    let token: string;
    try {
      const body = await request.text();
      if (body.length > 4096) return reply({ error: "INVALID_REQUEST" }, 400);
      const input: unknown = JSON.parse(body);
      if (!input || typeof input !== "object" || !("token" in input) || typeof input.token !== "string" || !input.token || input.token.length > 200) return reply({ error: "INVALID_REQUEST" }, 400);
      token = input.token;
    } catch { return reply({ error: "INVALID_REQUEST" }, 400); }
    try {
      const [entry] = await membership._link({ token });
      return entry ? reply({ name: entry.name }) : reply({ error: "NOT_FOUND" }, 404);
    } catch { return reply({ error: "UNAVAILABLE" }, 503); }
  };
}
