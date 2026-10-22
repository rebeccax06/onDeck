import { expect, test } from "bun:test";
import { createLiveRefresh } from "../../web/live-refresh.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("a delayed group A response cannot replace group B after switching", async () => {
  const old = deferred<string>();
  let shown = "group A";
  let calls = 0;
  const errors: unknown[] = [];
  const live = createLiveRefresh(
    () => (++calls === 1 ? old.promise : Promise.resolve("group B updated")),
    (value) => {
      shown = value;
    },
    (error) => errors.push(error),
  );
  const readingA = live.refresh();
  live.invalidate();
  shown = "group B";
  old.resolve("group A stale");
  await readingA;
  expect(shown).toBe("group B");
  await live.refresh();
  expect(shown).toBe("group B updated");
  expect(errors).toEqual([]);
});

test("a foreground write invalidates an older read even within the same group", async () => {
  const old = deferred<number>();
  let hearts = 0;
  const live = createLiveRefresh(
    () => old.promise,
    (value) => {
      hearts = value;
    },
    () => {},
  );
  const reading = live.refresh();
  live.invalidate();
  hearts = 1;
  old.resolve(0);
  await reading;
  expect(hearts).toBe(1);
});

test("a failed read retains the last view, reports failure, and allows recovery", async () => {
  let shown = "last successful view",
    warning = "",
    attempt = 0;
  const live = createLiveRefresh(
    async () => {
      if (++attempt === 1) throw new Error("connection lost");
      return "reconnected view";
    },
    (value) => {
      shown = value;
      warning = "";
    },
    (error) => {
      warning = (error as Error).message;
    },
  );
  await live.refresh();
  expect(shown).toBe("last successful view");
  expect(warning).toBe("connection lost");
  await live.refresh();
  expect(shown).toBe("reconnected view");
  expect(warning).toBe("");
});

test("an old account's failed read cannot replace the new account's status", async () => {
  const old = deferred<string>();
  const errors: unknown[] = [];
  let shown = "new account";
  const live = createLiveRefresh(
    () => old.promise,
    (value) => {
      shown = value;
    },
    (error) => errors.push(error),
  );
  const reading = live.refresh();
  live.invalidate();
  old.reject(new Error("old account session expired"));
  await reading;
  expect(shown).toBe("new account");
  expect(errors).toEqual([]);
});

test("timer and focus requests cannot start overlapping reads", async () => {
  const pending = deferred<string>();
  let calls = 0;
  const applied: string[] = [];
  const live = createLiveRefresh(
    () => {
      calls++;
      return pending.promise;
    },
    (value) => applied.push(value),
    () => {},
  );
  const timer = live.refresh();
  await live.refresh();
  expect(calls).toBe(1);
  pending.resolve("one snapshot");
  await timer;
  expect(applied).toEqual(["one snapshot"]);
});

test("unmounting suppresses pending results, pending errors, and further reads", async () => {
  for (const fail of [false, true]) {
    const pending = deferred<string>();
    let calls = 0;
    const outcomes: unknown[] = [];
    const live = createLiveRefresh(
      () => {
        calls++;
        return pending.promise;
      },
      (value) => outcomes.push(value),
      (error) => outcomes.push(error),
    );
    const reading = live.refresh();
    live.dispose();
    if (fail) pending.reject(new Error("late error"));
    else pending.resolve("late result");
    await reading;
    await live.refresh();
    expect(calls).toBe(1);
    expect(outcomes).toEqual([]);
  }
});

test("an invalidation during a read queues another read and suppresses the stale snapshot", async () => {
  const pending = deferred<string>();
  let calls = 0;
  const applied: string[] = [];
  const live = createLiveRefresh(
    () => (++calls === 1 ? pending.promise : Promise.resolve("after event")),
    (value) => applied.push(value),
    () => {},
  );
  const reading = live.refresh();
  live.request();
  live.request();
  pending.resolve("before event");
  await reading;
  expect(calls).toBe(2);
  expect(applied).toEqual(["after event"]);
});
