import { DependencyList, useEffect, useRef } from 'react';

type AutoRefreshOptions = {
  /** Interval in milliseconds between refresh calls. Defaults to 60 seconds. */
  intervalMs?: number;
  /** Whether the auto refresh interval should run. Defaults to true. */
  enabled?: boolean;
  /** If true, invoke the callback once on mount before starting the interval. Defaults to false. */
  runOnMount?: boolean;
};

/**
 * Provides a simple auto-refresh interval that always uses the latest callback reference.
 * The callback can be synchronous or return a promise. Errors should be handled inside the callback.
 */
export function useAutoRefresh(
  callback: () => void | Promise<void>,
  options: AutoRefreshOptions = {},
  deps: DependencyList = [],
) {
  const { intervalMs = 60_000, enabled = true, runOnMount = false } = options;
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (runOnMount) {
      void savedCallback.current();
    }

    const tick = () => {
      void savedCallback.current();
    };

    if (typeof window === 'undefined') {
      return undefined;
    }

    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, runOnMount, ...deps]);
}
