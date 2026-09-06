export type WorkshopPollingHooks = {
  isVisible: () => boolean;
  refresh: () => Promise<boolean>;
  onError: (error: unknown) => void;
  onSettled: () => void;
  addVisibilityListener: (listener: () => void) => void;
  removeVisibilityListener: (listener: () => void) => void;
  setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
};

/**
 * Keep the workshop status request single-flight. A visible-tab transition
 * clears stale polling and asks once immediately; an already-running request
 * becomes that refresh instead of racing a second request.
 */
export function startWorkshopPolling(hooks: WorkshopPollingHooks) {
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  const clearScheduled = () => {
    if (timer !== undefined) hooks.clearTimer(timer);
    timer = undefined;
  };
  const schedule = (delay: number) => {
    clearScheduled();
    timer = hooks.setTimer(() => {
      timer = undefined;
      void poll();
    }, delay);
  };
  const poll = async () => {
    if (stopped || inFlight) return;
    if (!hooks.isVisible()) {
      hooks.onSettled();
      schedule(30_000);
      return;
    }
    inFlight = true;
    let delay = 30_000;
    try {
      const active = await hooks.refresh();
      failures = 0;
      delay = active ? 5_000 : 30_000;
    } catch (error) {
      failures += 1;
      delay = Math.min(60_000, 5_000 * 2 ** Math.min(failures, 4));
      hooks.onError(error);
    } finally {
      inFlight = false;
      hooks.onSettled();
      if (!stopped) schedule(delay);
    }
  };
  const onVisibilityChange = () => {
    if (stopped || !hooks.isVisible()) return;
    clearScheduled();
    // A previous status request is already the one immediate refresh. Do not
    // start another request or leave competing timers behind.
    if (!inFlight) void poll();
  };

  hooks.addVisibilityListener(onVisibilityChange);
  void poll();
  return () => {
    stopped = true;
    clearScheduled();
    hooks.removeVisibilityListener(onVisibilityChange);
  };
}
