import type { Server, ServerWebSocket } from "bun";
import type { Authenticate } from "./server.ts";

export type LiveSocketData = { user: string; expires: number };
export function createLiveHub(authenticate: Authenticate, origins: string[]) {
  const tickets = new Map<string, { user: string; origin: string; expires: number }>();
  const sockets = new Set<ServerWebSocket<LiveSocketData>>();
  const timers = new Map<ServerWebSocket<LiveSocketData>, ReturnType<typeof setTimeout>>();
  const reply = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  const originOf = (request: Request) => request.headers.get("origin") ?? "";
  return {
    async ticket(request: Request) {
      if (request.method !== "POST") return reply("INVALID_REQUEST", 405);
      const origin = originOf(request);
      if (!origins.includes(origin)) return reply("FORBIDDEN", 403);
      const user = await authenticate(request);
      if (!user) return reply("UNAUTHORIZED", 401);
      for (const [key, entry] of tickets) if (entry.expires <= Date.now() || entry.user === user) tickets.delete(key);
      const ticket = crypto.randomUUID() + crypto.randomUUID();
      tickets.set(ticket, { user, origin, expires: Date.now() + 30_000 });
      return Response.json({ ticket }, { headers: { "Cache-Control": "no-store" } });
    },
    upgrade(request: Request, server: Server<LiveSocketData>) {
      const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
      const entry = tickets.get(ticket);
      tickets.delete(ticket);
      if (!entry || entry.expires <= Date.now() || entry.origin !== originOf(request) || !origins.includes(entry.origin))
        return reply("UNAUTHORIZED", 401);
      if (server.upgrade(request, { data: { user: entry.user, expires: Date.now() + 300_000 } })) return undefined;
      return reply("INVALID_REQUEST", 400);
    },
    changed(users: Set<string>) {
      for (const socket of sockets) if (users.has(socket.data.user)) socket.send('{"type":"changed"}');
    },
    websocket: {
      idleTimeout: 45,
      maxPayloadLength: 128,
      open(socket: ServerWebSocket<LiveSocketData>) {
        sockets.add(socket);
        timers.set(socket, setTimeout(() => socket.close(4001, "Renew session"), Math.max(0, socket.data.expires - Date.now())));
        socket.send('{"type":"ready"}');
      },
      message(socket: ServerWebSocket<LiveSocketData>, message: string | Buffer) {
        if (message.toString() === "ping") socket.send('{"type":"pong"}');
        else socket.close(1008, "Unsupported message");
      },
      close(socket: ServerWebSocket<LiveSocketData>) {
        sockets.delete(socket); clearTimeout(timers.get(socket)); timers.delete(socket);
      },
    },
  };
}
