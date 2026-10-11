import { createApiHandler } from "./server.ts";
import { configuredClerkAuthenticator } from "./auth.ts";
import { assembleApplication } from "./assembly.ts";
import { createPeopleHandler, clerkNameLookup } from "./people.ts";
import { clerkEmailLookup, emailInviteResolver } from "./invite-email.ts";
import { db } from "./db.ts";

const application = assembleApplication();
const authenticate = configuredClerkAuthenticator();
const resolveInvitee = emailInviteResolver(application.concepts.MembershipTracking, clerkEmailLookup(process.env.CLERK_SECRET_KEY!));
const api = createApiHandler(application, authenticate, resolveInvitee);
const people = createPeopleHandler(authenticate, application.concepts.MembershipTracking, clerkNameLookup(process.env.CLERK_SECRET_KEY!));

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/*": api,
    "/auth/people": people,
    "/health": async () => {
      try {
        await db.collection("activityCapturing").findOne({}, { maxTimeMS: 2000, timeoutMS: 3000 });
        return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return Response.json(
          { status: "unavailable" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    },
  },
});

console.log(`Backend listening on ${server.url}`);
