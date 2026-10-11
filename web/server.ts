import homepage from "./index.html";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:3000";
function proxy(request: Request) {
  const url = new URL(request.url);
  return fetch(new URL(url.pathname + url.search, backend), request).catch(
    () => Response.json({ error: "UNAVAILABLE" }, { status: 503 }),
  );
}
const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8080),
  routes: {
    "/": homepage,
    "/api/*": proxy,
    "/auth/people": proxy,
    "/health": proxy,
    // Only the public key is sent to the browser. The secret key stays on the backend.
    "/config": () => Response.json({ clerkPublishableKey: (process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY) ?? "" }, {
      headers: { "Cache-Control": "no-store" },
    }),
  },
});
console.log(`Frontend listening on ${server.url}`);
