import { useEffect, useState } from "react";

/**
 * Keeps an initial loading view visible for at least `minimumDurationMs`.
 * Subsequent asynchronous loading is still surfaced immediately.
 */
export function useMinimumLoading(loading: boolean, minimumDurationMs = 1_500): boolean {
  const [innerLoading, setInnerLoading] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setInnerLoading(false), minimumDurationMs);
    return () => window.clearTimeout(timeoutId);
  }, [minimumDurationMs]);

  return loading || innerLoading;
}
