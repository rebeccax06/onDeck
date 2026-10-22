type Options = {
  ticket: () => Promise<string>;
  refresh: () => void;
  status: (message: string) => void;
  url: () => URL;
};

/** One connection per signed-in account; no routine data polling. */
export function createLiveConnection(options: Options) {
  let socket: WebSocket | undefined;
  let stopped = true, generation = 0, attempts = 0, lastMessage = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  function reconnect(current: number) {
    if (stopped || current !== generation) return;
    clearInterval(heartbeat);
    options.status("Reconnecting…");
    const delay = Math.min(30_000, 500 * 2 ** Math.min(attempts++, 6)) * (0.8 + Math.random() * 0.4);
    retry = setTimeout(() => void connect(current), delay);
  }
  async function connect(current: number) {
    try {
      const ticket = await options.ticket();
      if (stopped || current !== generation) return;
      const url = options.url(); url.searchParams.set("ticket", ticket);
      const next = new WebSocket(url);
      socket = next;
      next.onopen = () => {
        if (stopped || current !== generation) { next.close(); return; }
        lastMessage = Date.now();
        heartbeat = setInterval(() => {
          if (Date.now() - lastMessage > 35_000) next.close();
          else if (next.readyState === WebSocket.OPEN) next.send("ping");
        }, 15_000);
      };
      next.onmessage = event => {
        if (stopped || current !== generation) return;
        lastMessage = Date.now();
        try {
          const type = (JSON.parse(String(event.data)) as { type?: string }).type;
          if (type === "ready") { attempts = 0; options.status(""); options.refresh(); }
          if (type === "changed") options.refresh();
        } catch { next.close(); }
      };
      next.onclose = () => reconnect(current);
      next.onerror = () => next.close();
    } catch { reconnect(current); }
  }
  function stop() {
    stopped = true; generation++;
    clearTimeout(retry); clearInterval(heartbeat);
    if (socket) { socket.onclose = null; socket.close(); socket = undefined; }
  }
  return {
    start() { stop(); stopped = false; attempts = 0; void connect(generation); },
    stop,
  };
}
