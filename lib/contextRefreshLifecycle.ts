// Lifecycle primitives for ephemeral, calendar-scoped context.  Kept free of
// React Native and stores so hooks can supply their own AppState subscription.

export type Dispose = () => void;

export type ContextRefreshLifecycleOptions = {
  /** Refresh when a local calendar boundary is reached. */
  onBoundary: () => void;
  /** Local times to observe, expressed as [hour, minute]. */
  boundaries: ReadonlyArray<readonly [number, number]>;
  now?: () => Date;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

/**
 * Schedules the next local-time boundary exactly. It deliberately does not
 * poll in the background. Rebuilding the timer on foreground also accounts
 * for timezone and wall-clock changes made while the app was inactive.
 */
export type ContextRefreshLifecycle = Dispose & { reschedule: () => void };

export function createContextRefreshLifecycle(options: ContextRefreshLifecycleOptions): ContextRefreshLifecycle {
  const now = options.now ?? (() => new Date());
  const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (disposed) return;
    if (timer !== null) clearTimer(timer);
    const current = now();
    const next = nextBoundaryAfter(current, options.boundaries);
    // Add a tiny cushion so a timer that fires fractionally early never
    // observes the previous date/hour and skips a boundary.
    const delay = Math.max(1, next.getTime() - current.getTime() + 25);
    timer = setTimer(() => {
      timer = null;
      if (disposed) return;
      options.onBoundary();
      schedule();
    }, delay);
  };

  schedule();
  const dispose = (() => {
    disposed = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }) as ContextRefreshLifecycle;
  dispose.reschedule = schedule;
  return dispose;
}

export function nextBoundaryAfter(
  current: Date,
  boundaries: ReadonlyArray<readonly [number, number]>,
): Date {
  const candidates = boundaries.map(([hour, minute]) => {
    const candidate = new Date(current);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= current.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  });
  if (candidates.length === 0) throw new Error('At least one context boundary is required');
  return candidates.reduce((earliest, candidate) =>
    candidate.getTime() < earliest.getTime() ? candidate : earliest,
  );
}

/** A monotonic token for ignoring async results from stale refreshes. */
export function createRefreshGeneration() {
  let current = 0;
  return {
    begin: () => ++current,
    invalidate: () => ++current,
    isCurrent: (generation: number) => generation === current,
  };
}

/** Converts a hanging native call into a settled null result. */
export function resolveWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}
