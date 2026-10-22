import { proxyWebSocket, proxySocketHandler, type ProxySocketData } from "./ws-proxy.ts";
import homepage from "./index.html";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:3000";
function proxy(request: Request) {
  const url = new URL(request.url);
  return fetch(new URL(url.pathname + url.search, backend), request).catch(
    () => Response.json({ error: "UNAVAILABLE" }, { status: 503 }),
  );
}
const server = Bun.serve<ProxySocketData>({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8080),
  websocket: proxySocketHandler,
  // Avoid Bun’s client module registry failures during incremental updates.
  // Server watch mode still rebuilds on refresh; production stays optimized.
  development: process.env.NODE_ENV === "production" ? false : { hmr: false },
  routes: {
    "/live": (request: Request, server: Bun.Server<ProxySocketData>) => proxyWebSocket(request, server, backend),
    "/live/ticket": proxy,
    "/sharing/*": proxy,
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
