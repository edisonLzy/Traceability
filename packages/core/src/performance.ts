import type { PerformanceMetric } from "./types.js";

type ReportMetric = (metric: PerformanceMetric) => void;
type EntryWithFields = PerformanceEntry & Record<string, unknown>;

/**
 * Lightweight Web Vitals-style collection without a runtime dependency. Every
 * metric is emitted once per page view, on the next available browser signal.
 */
export function installPerformanceMonitoring(report: ReportMetric): void {
  if (typeof window === "undefined" || typeof performance === "undefined") return;

  const sent = new Set<string>();
  const emit = (metric: PerformanceMetric) => {
    if (sent.has(metric.name)) return;
    sent.add(metric.name);
    report(metric);
  };

  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const emitNavigation = () => {
    if (!navigation) return;
    emit({
      name: "TTFB",
      value: Math.max(0, navigation.responseStart - navigation.startTime),
      unit: "millisecond",
    });
    emit({
      name: "DOMContentLoaded",
      value: Math.max(0, navigation.domContentLoadedEventEnd - navigation.startTime),
      unit: "millisecond",
    });
  };

  if (document.readyState === "complete") {
    emitNavigation();
  } else {
    window.addEventListener("load", emitNavigation, { once: true });
  }

  observe("paint", (entries) => {
    const fcp = entries.find((entry) => entry.name === "first-contentful-paint");
    if (fcp) emit({ name: "FCP", value: fcp.startTime, unit: "millisecond" });
  });

  let lcp = 0;
  observe("largest-contentful-paint", (entries) => {
    const latest = entries[entries.length - 1];
    if (latest) lcp = latest.startTime;
  });

  let cls = 0;
  observe("layout-shift", (entries) => {
    for (const entry of entries) {
      if (!entry.hadRecentInput) cls += Number(entry.value ?? 0);
    }
  });

  let inp = 0;
  observe(
    "event",
    (entries) => {
      for (const entry of entries) inp = Math.max(inp, Number(entry.duration ?? 0));
    },
    16,
  );

  const flushFinalMetrics = () => {
    if (lcp > 0) emit({ name: "LCP", value: lcp, unit: "millisecond" });
    emit({ name: "CLS", value: cls, unit: "score" });
    if (inp > 0) emit({ name: "INP", value: inp, unit: "millisecond" });
  };
  window.addEventListener("pagehide", flushFinalMetrics, { once: true });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") flushFinalMetrics();
    },
    { once: true },
  );
}

function observe(
  type: string,
  callback: (entries: EntryWithFields[]) => void,
  durationThreshold?: number,
): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) =>
      callback(list.getEntries() as EntryWithFields[]),
    );
    observer.observe({
      type,
      buffered: true,
      ...(durationThreshold ? { durationThreshold } : {}),
    } as PerformanceObserverInit);
  } catch {
    // Older browsers only expose a subset of PerformanceObserver entry types.
  }
}
