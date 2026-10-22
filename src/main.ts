import { createApiHandler } from "./server.ts";
import { configuredClerkAuthenticator } from "./auth.ts";
import { assembleApplication } from "./assembly.ts";
import { createPeopleHandler, clerkNameLookup } from "./people.ts";
import { createLiveHub, type LiveSocketData } from "./live.ts";
import { createSharingHandler } from "./sharing.ts";
import { db } from "./db.ts";

const application = assembleApplication();
const authenticate = configuredClerkAuthenticator();
const origins = (process.env.CLERK_AUTHORIZED_PARTIES ?? "http://127.0.0.1:8080,http://localhost:8080").split(",").map(value => value.trim()).filter(Boolean);
const live = createLiveHub(authenticate, origins);
const sharing = createSharingHandler(authenticate, application.concepts.MembershipTracking);
const api = createApiHandler(application, authenticate, { changed: live.changed });
const people = createPeopleHandler(authenticate, application.concepts.MembershipTracking, clerkNameLookup(process.env.CLERK_SECRET_KEY!));

const server = Bun.serve<LiveSocketData>({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  websocket: live.websocket,
  routes: {
    "/live/ticket": live.ticket,
    "/live": (request: Request, server: Bun.Server<LiveSocketData>) => live.upgrade(request, server),
    "/sharing/*": sharing,
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
