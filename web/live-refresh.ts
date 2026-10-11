/** Only the newest read may update the UI; foreground actions invalidate pending reads. */
export function createLiveRefresh<T>(load: () => Promise<T>, apply: (snapshot: T) => void, failed: (error: unknown) => void) {
  let version = 0;
  let pending = false;
  let disposed = false;
  return {
    invalidate() { version++; },
    dispose() { disposed = true; version++; },
    async refresh() {
      if (disposed || pending) return;
      pending = true;
      const started = version;
      try {
        const snapshot = await load();
        if (!disposed && started === version) apply(snapshot);
      } catch (error) {
        if (!disposed && started === version) failed(error);
      } finally { pending = false; }
    },
  };
}
