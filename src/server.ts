import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import type { assembleApplication } from "./assembly.ts";
import { InviteEmailError, type ResolveInvitee } from "./invite-email.ts";
import { policy } from "./http.ts";

export type Authenticate = (request: Request) => string | null | Promise<string | null>;
const bodyLimit = 1_048_576;
const failure = (error: string, status: number) => Response.json({ error }, {
  status, headers: { "Cache-Control": "no-store" },
});

/** The host supplies the actor; the client may never choose it in JSON. */
export function createApiHandler(application: ReturnType<typeof assembleApplication>, authenticate: Authenticate, resolveInvitee?: ResolveInvitee) {
  const gateway = createGateway({ application });
  const handler = createHttpHandler({ application, gateway, policy });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return handler(request);
    let user: string | null;
    try { user = await authenticate(request); }
    catch { return failure("INTERNAL_ERROR", 500); }
    if (!user) return failure("UNAUTHORIZED", 401);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failure("INVALID_REQUEST", 400);
    const reader = request.body?.getReader();
    if (!reader) return failure("INVALID_REQUEST", 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > bodyLimit) { await reader.cancel(); return failure("INVALID_REQUEST", 400); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!value || typeof value !== "object" || Array.isArray(value)) return failure("INVALID_REQUEST", 400);
      const input = { ...value } as Record<string, unknown>;
      if (resolveInvitee && new URL(request.url).pathname === "/api/groups/invite") {
        if (typeof input.group !== "string" || typeof input.invitee !== "string") return failure("INVALID_REQUEST", 400);
        try { input.invitee = await resolveInvitee(user, input.group, input.invitee); }
        catch (error) {
          if (error instanceof InviteEmailError) return failure(error.code, error.status);
          return failure("UNAVAILABLE", 503);
        }
      }
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      const forwarded = new Request(request.url, { method: "POST", headers, signal: request.signal,
        body: JSON.stringify({ ...input, user }) });
      const response = await handler(forwarded);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch { return failure("INVALID_REQUEST", 400); }
    finally { reader.releaseLock(); }
  };
}

/** Minimal host adapter; replace with a session/identity provider without changing concepts. */
export function bearerAuthenticator(tokens: Readonly<Record<string, string>>): Authenticate {
  return (request) => {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return null;
    const token = authorization.slice(7);
    return Object.hasOwn(tokens, token) && tokens[token] ? tokens[token]! : null;
  };
}
