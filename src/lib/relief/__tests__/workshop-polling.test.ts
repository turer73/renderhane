import { describe, expect, it, vi } from "vitest";
import { startWorkshopPolling, type WorkshopPollingHooks } from "../workshop-polling";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(refresh: () => Promise<boolean>) {
  let visible = true;
  let listener: (() => void) | undefined;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 1;
  const hooks: WorkshopPollingHooks = {
    isVisible: () => visible,
    refresh,
    onError: vi.fn(), onSettled: vi.fn(),
    addVisibilityListener: (value) => { listener = value; },
    removeVisibilityListener: (value) => { if (listener === value) listener = undefined; },
    setTimer: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (timer) => { timers.delete(timer as unknown as number); },
  };
  return {
    hooks, timers,
    setVisible: (value: boolean) => { visible = value; },
    visibilityChange: () => listener?.(),
  };
}

describe("workshop polling", () => {
  it("does exactly one immediate status refresh on visibility and never races an in-flight poll", async () => {
    const pending = deferred<boolean>();
    const refresh = vi.fn(() => pending.promise);
    const test = harness(refresh);
    const stop = startWorkshopPolling(test.hooks);
    expect(refresh).toHaveBeenCalledTimes(1);

    test.visibilityChange();
    test.visibilityChange();
    expect(refresh).toHaveBeenCalledTimes(1);

    pending.resolve(false);
    await Promise.resolve();
    await Promise.resolve();
    expect([...test.timers.values()].map(({ delay }) => delay)).toEqual([30_000]);
    stop();
  });

  it("wakes a hidden tab once and uses the active-job cadence after the refresh", async () => {
    const refresh = vi.fn().mockResolvedValue(true);
    const test = harness(refresh);
    test.setVisible(false);
    const stop = startWorkshopPolling(test.hooks);
    expect(refresh).not.toHaveBeenCalled();
    expect([...test.timers.values()].map(({ delay }) => delay)).toEqual([30_000]);

    test.setVisible(true);
    test.visibilityChange();
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect([...test.timers.values()].map(({ delay }) => delay)).toEqual([5_000]);
    stop();
  });
});
