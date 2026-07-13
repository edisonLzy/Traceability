import { NoAppState } from "@renderer/components/NoAppState";
import { useCurrentApp } from "@renderer/context/current-app";
import { promptAgent } from "@renderer/lib/agent-events";
import { cn, relativeTime } from "@renderer/lib/utils";
import { usePerformanceSummary } from "@renderer/pages/performance/_hooks/use-performance";
import type { PerformanceMetricSummary, PerformanceMetricName } from "@traceability/protocol";
import { Activity, Info, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Hours = 1 | 24 | 168;

const RANGES: Array<{ hours: Hours; label: string }> = [
  { hours: 1, label: "Last hour" },
  { hours: 24, label: "Last 24 hours" },
  { hours: 168, label: "Last 7 days" },
];

export function PerformancePage() {
  const { currentApp, appId } = useCurrentApp();
  const [hours, setHours] = useState<Hours>(24);
  const { data: summary, error } = usePerformanceSummary({ appId, hours });

  useEffect(() => {
    if (error) toast(String(error));
  }, [error]);

  const app = summary?.apps[0] ?? null;
  const metrics = app ? Object.entries(app.metrics).sort(([a], [b]) => a.localeCompare(b)) : [];
  const rangeLabel = RANGES.find((r) => r.hours === hours)!.label;

  const warnings = useMemo(
    () =>
      metrics.filter(([name, m]) => metricQuality(name as PerformanceMetricName, m) !== "good")
        .length,
    [metrics],
  );
  const lastSample = metrics
    .map(([, m]) => new Date(m.lastSeen).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  if (!currentApp) return <NoAppState />;

  const analyzeView = () => {
    if (!currentApp) return;
    promptAgent({
      context: { appId: currentApp.id, source: "performance", hours },
      prompt: "Analyze the current performance view",
    });
  };

  const askMetric = (name: string) => {
    if (!currentApp) return;
    promptAgent({
      context: { appId: currentApp.id, source: "metric", metricName: name, hours },
      prompt: `Explain ${name}`,
    });
  };

  return (
    <div className="mx-auto block min-h-full max-w-[1260px] px-[22px] pt-[22px] pb-12">
      <header className="mb-[18px] flex items-start justify-between gap-5">
        <div>
          <div className="mb-1 text-[11px] font-[680] uppercase tracking-[0.07em] text-primary-hover">
            Monitor
          </div>
          <h1 className="m-0 text-[24px] font-[680] leading-[1.12] tracking-[-0.04em]">
            Performance
          </h1>
          <p className="mt-1.5 max-w-[620px] text-[12px] text-tertiary">
            Web Vitals and application-defined metrics for the current application. The agent can
            only reason over the collected summaries shown here.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1.5">
          <button
            type="button"
            onClick={analyzeView}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-[9px] border border-primary/40 bg-primary px-3 text-[12px] font-[590] text-[#111329] transition-colors hover:bg-primary-hover"
          >
            <Sparkles size={14} /> Analyze this view
          </button>
        </div>
      </header>

      <div className="mb-3.5 flex items-center gap-2">
        <div
          className="inline-flex gap-0.5 rounded-[9px] border border-hairline bg-black/15 p-0.5"
          role="group"
          aria-label="Performance time range"
        >
          {RANGES.map((r) => (
            <button
              key={r.hours}
              type="button"
              onClick={() => setHours(r.hours)}
              className={cn(
                "h-7 rounded-[6px] px-2 text-[11px] text-tertiary transition-colors",
                hours === r.hours ? "bg-white/[0.09] text-ink" : "hover:text-muted",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-tertiary">
          <Info size={13} /> Summaries update when the SDK sends a sample.
        </span>
      </div>

      <div className="mb-[18px] grid grid-cols-4 overflow-hidden rounded-2xl border border-hairline bg-white/[0.025]">
        <Metric
          label="Metric samples"
          value={(app?.samples ?? 0).toLocaleString()}
          note={rangeLabel}
        />
        <Metric label="Metric types" value={metrics.length} note="Collected by the SDK" />
        <Metric
          label="Needs attention"
          value={warnings}
          note={warnings ? "Outside target range" : "Within target ranges"}
          noteClass={warnings ? "text-warning" : "text-success"}
        />
        <Metric
          label="Last sample"
          value={lastSample ? relativeTime(new Date(lastSample).toISOString()) : "-"}
          note="Production"
          last
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-hairline bg-white/[0.025]">
        <div className="flex min-h-12 items-center border-b border-hairline px-4">
          <span className="text-[12px] font-[630] text-muted">Metric summaries</span>
          <span className="ml-auto text-[11px] text-tertiary">{rangeLabel}</span>
        </div>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {["Metric", "Average", "p75", "Samples", "Last seen", ""].map((h) => (
                <th
                  key={h}
                  className="border-b border-hairline px-4 py-2.5 text-[10px] font-[670] uppercase tracking-[0.075em] text-tertiary"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(([name, metric]) => {
              const quality = metricQuality(name as PerformanceMetricName, metric);
              return (
                <tr key={name}>
                  <td className="border-b border-hairline px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-mono text-[11px] text-ink">
                      <Activity size={13} className="text-tertiary" /> {name}
                    </span>
                  </td>
                  <td className="border-b border-hairline px-4 py-3 text-[12px] text-muted tabular-nums">
                    {formatMetric(name as PerformanceMetricName, metric.average)}
                  </td>
                  <td
                    className={cn(
                      "border-b border-hairline px-4 py-3 text-[12px] tabular-nums",
                      quality === "good" && "text-success",
                      quality === "warn" && "text-warning",
                      quality === "danger" && "text-danger",
                    )}
                  >
                    {formatMetric(name as PerformanceMetricName, metric.p75)}
                  </td>
                  <td className="border-b border-hairline px-4 py-3 text-[12px] text-muted tabular-nums">
                    {metric.count.toLocaleString()}
                  </td>
                  <td className="border-b border-hairline px-4 py-3 text-[12px] text-muted">
                    {relativeTime(metric.lastSeen)}
                  </td>
                  <td className="border-b border-hairline px-4 py-3">
                    <button
                      type="button"
                      onClick={() => askMetric(name)}
                      className="rounded-[6px] px-1.5 py-1 text-[11px] text-primary-hover transition-colors hover:bg-primary/15"
                    >
                      Ask agent
                    </button>
                  </td>
                </tr>
              );
            })}
            {metrics.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[12px] text-tertiary">
                  {summary ? "No performance samples received yet." : "Loading performance data…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  noteClass,
  last,
}: {
  label: string;
  value: number | string;
  note: string;
  noteClass?: string;
  last?: boolean;
}) {
  return (
    <div className={cn("min-h-[84px] px-4 py-3.5", !last && "border-r border-hairline")}>
      <div className="text-[11px] font-[570] text-tertiary">{label}</div>
      <div className="mt-1 text-[22px] font-[660] tracking-[-0.045em] tabular-nums">{value}</div>
      <div className={cn("mt-0.5 text-[10px] text-tertiary", noteClass)}>{note}</div>
    </div>
  );
}

function formatMetric(name: PerformanceMetricName, value: number): string {
  if (name === "CLS") return value.toFixed(2);
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${value.toFixed(0)} ms`;
}

function metricQuality(
  name: PerformanceMetricName,
  summary: PerformanceMetricSummary,
): "good" | "warn" | "danger" {
  const p75 = summary.p75;
  if (name === "LCP") return p75 <= 2500 ? "good" : p75 <= 4000 ? "warn" : "danger";
  if (name === "INP") return p75 <= 200 ? "good" : p75 <= 500 ? "warn" : "danger";
  if (name === "CLS") return p75 <= 0.1 ? "good" : p75 <= 0.25 ? "warn" : "danger";
  if (name === "FCP") return p75 <= 1800 ? "good" : p75 <= 3000 ? "warn" : "danger";
  if (name === "TTFB") return p75 <= 800 ? "good" : p75 <= 1800 ? "warn" : "danger";
  if (name === "DOMContentLoaded") return p75 <= 2000 ? "good" : p75 <= 4000 ? "warn" : "danger";
  return "good";
}
