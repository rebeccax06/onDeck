import type { Server, ServerWebSocket } from "bun";

export type ProxySocketData = { upstream: WebSocket; queued: string[]; socket?: ServerWebSocket<ProxySocketData> };
/** Bun's HTTP fetch proxy cannot forward an Upgrade; bridge the two sockets explicitly. */
export async function proxyWebSocket(request: Request, server: Server<ProxySocketData>, backend: string) {
  const target = new URL(new URL(request.url).pathname + new URL(request.url).search, backend);
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  // DOM types hide Bun's server-side headers option.
  const RuntimeWebSocket = WebSocket as unknown as { new(url: URL, options: Bun.WebSocketOptions): WebSocket };
  const upstream = new RuntimeWebSocket(target, { headers: { Origin: request.headers.get("origin") ?? "" } });
  const data: ProxySocketData = { upstream, queued: [] };
  upstream.onmessage = event => {
    if (data.socket) data.socket.send(String(event.data));
    else data.queued.push(String(event.data));
  };
  upstream.onclose = () => data.socket?.close(1012, "Reconnect");
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { upstream.close(); reject(new Error("Timed out")); }, 5000);
      upstream.onopen = () => { clearTimeout(timeout); resolve(); };
      upstream.onerror = () => { clearTimeout(timeout); reject(new Error("Unavailable")); };
    });
    if (request.signal.aborted || !server.upgrade(request, { data })) { upstream.close(); return new Response("Upgrade required", { status: 400 }); }
    return undefined;
  } catch { upstream.close(); return new Response("Connection unavailable", { status: 503 }); }
}
export const proxySocketHandler = {
  idleTimeout: 45,
  maxPayloadLength: 128,
  open(socket: ServerWebSocket<ProxySocketData>) {
    socket.data.socket = socket;
    for (const message of socket.data.queued) socket.send(message);
    socket.data.queued.length = 0;
    if (socket.data.upstream.readyState !== WebSocket.OPEN) socket.close(1012, "Reconnect");
  },
  message(socket: ServerWebSocket<ProxySocketData>, message: string | Buffer) {
    if (socket.data.upstream.readyState === WebSocket.OPEN) socket.data.upstream.send(message.toString());
  },
  close(socket: ServerWebSocket<ProxySocketData>) { socket.data.upstream.close(); },
};
