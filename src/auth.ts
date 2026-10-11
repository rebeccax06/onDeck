import { createClerkClient } from "@clerk/backend";
import type { Authenticate } from "./server.ts";

export type ClerkAuthConfig = {
  secretKey: string;
  publishableKey: string;
  authorizedParties: string[];
  jwtKey?: string;
};

export function clerkAuthenticator(config: ClerkAuthConfig): Authenticate {
  const clerk = createClerkClient({ secretKey: config.secretKey, publishableKey: config.publishableKey });
  return async (request) => {
    // Require the explicit token obtained by the browser SDK, rather than a forwarded cookie.
    if (!request.headers.get("authorization")?.startsWith("Bearer ")) return null;
    const state = await clerk.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties: config.authorizedParties,
      jwtKey: config.jwtKey,
    });
    return state.isAuthenticated ? state.toAuth().userId : null;
  };
}

export function configuredClerkAuthenticator(): Authenticate {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = (process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY);
  if (!secretKey || !publishableKey) throw new Error("Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY in .env. See README.md.");
  const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES ?? "http://127.0.0.1:8080,http://localhost:8080")
    .split(",").map(value => value.trim()).filter(Boolean);
  if (!authorizedParties.length) throw new Error("CLERK_AUTHORIZED_PARTIES must include your frontend origin.");
  return clerkAuthenticator({ secretKey, publishableKey, authorizedParties });
}
