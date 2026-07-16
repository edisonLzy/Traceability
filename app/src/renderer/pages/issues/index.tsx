import { useCurrentApp } from "@renderer/context/current-app";
import { useInvalidateIssues, useIssues } from "@renderer/hooks/use-issues";
import { promptAgent } from "@renderer/lib/agent-events";
import { cn, issueSource, relativeTime, statusGroup, statusLabel } from "@renderer/lib/utils";
import { onIssueEvent } from "@renderer/lib/ws";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const STATUS_ITEMS: Array<{ value: "all" | "open" | "investigating" | "fixed"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "fixed", label: "Fixed" },
];

export function IssuesPage() {
  const { currentApp, appId } = useCurrentApp();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "investigating" | "fixed">("all");

  const invalidateIssues = useInvalidateIssues();
  const { data, isLoading } = useIssues({ appId, limit: 100 });
  const issues = data?.items ?? [];

  useEffect(() => {
    return onIssueEvent(() => {
      void invalidateIssues();
    });
  }, [invalidateIssues]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return issues.filter((issue) => {
      if (status !== "all" && statusGroup(issue.status) !== status) return false;
      if (
        query &&
        !`${issue.title} ${issue.id} ${issueSource(issue)}`.toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [issues, status, q]);

  const open = issues.filter((i) => statusGroup(i.status) === "open").length;
  const investigating = issues.filter((i) => statusGroup(i.status) === "investigating").length;
  const fixed = issues.filter((i) => statusGroup(i.status) === "fixed").length;
  const events = issues.reduce((n, i) => n + i.count, 0);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["issues"] });
    toast("Monitoring data refreshed");
  };

  const askAboutIssues = () => {
    if (!currentApp) return;
    promptAgent({
      context: { appId: currentApp.id, source: "general" },
      prompt: "Summarize the current open issues",
    });
  };

  return (
    <div className="mx-auto block min-h-full max-w-[1260px] px-[22px] pt-[22px] pb-12">
      <header className="mb-[18px] flex items-start justify-between gap-5">
        <div>
          <div className="mb-1 text-[11px] font-[680] uppercase tracking-[0.07em] text-primary-hover">
            Monitor
          </div>
          <h1 className="m-0 text-[24px] font-[680] leading-[1.12] tracking-[-0.04em]">Issues</h1>
          <p className="mt-1.5 max-w-[620px] text-[12px] text-tertiary">
            Triage grouped runtime problems for the current application. Select an issue to inspect
            its evidence or investigate it with the agent.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1.5">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-[9px] border border-hairline bg-white/[0.045] px-3 text-[12px] font-[590] text-muted transition-colors hover:border-hairline-strong hover:bg-white/[0.08] hover:text-ink"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={askAboutIssues}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-[9px] border border-primary/40 bg-primary px-3 text-[12px] font-[590] text-[#111329] transition-colors hover:bg-primary-hover"
          >
            <Sparkles size={14} /> Ask about issues
          </button>
        </div>
      </header>

      <div className="mb-[18px] grid grid-cols-4 overflow-hidden rounded-2xl border border-hairline bg-white/[0.025]">
        <Metric label="Open issues" value={open} note="Needs triage" noteClass="text-warning" />
        <Metric
          label="Events · 24h"
          value={events.toLocaleString()}
          note="Aggregated by fingerprint"
        />
        <Metric label="Investigating" value={investigating} note="Agent context can be attached" />
        <Metric
          label="Resolved · 7d"
          value={fixed}
          note="Stable compared with last week"
          noteClass="text-success"
          last
        />
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <label className="flex h-9 max-w-[400px] min-w-[240px] flex-1 items-center gap-2 rounded-[9px] border border-hairline bg-white/[0.035] px-2.5 text-tertiary focus-within:border-primary/55 focus-within:shadow-[0_0_0_3px_rgba(143,156,255,0.1)]">
          <Search size={14} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search issues"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-tertiary"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Filter issue status"
          className="h-9 rounded-[9px] border border-hairline bg-surface-2 px-2.5 pr-7 text-[12px] text-muted outline-none focus:border-primary/55"
        >
          {STATUS_ITEMS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <span className="text-[11px] text-tertiary">
          {filtered.length} of {issues.length} issues
        </span>
      </div>

      <section className="overflow-hidden rounded-2xl border border-hairline bg-white/[0.025]">
        <div className="flex min-h-12 items-center border-b border-hairline px-4">
          <span className="text-[12px] font-[630] text-muted">All issues</span>
          <span className="ml-auto text-[11px] text-tertiary">Updated in real time</span>
        </div>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="border-b border-hairline px-4 py-2.5 text-[10px] font-[670] uppercase tracking-[0.075em] text-tertiary">
                Issue
              </th>
              <th className="border-b border-hairline px-4 py-2.5 text-[10px] font-[670] uppercase tracking-[0.075em] text-tertiary">
                Status
              </th>
              <th className="border-b border-hairline px-4 py-2.5 text-[10px] font-[670] uppercase tracking-[0.075em] text-tertiary">
                Events
              </th>
              <th className="border-b border-hairline px-4 py-2.5 text-[10px] font-[670] uppercase tracking-[0.075em] text-tertiary">
                Last seen
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((issue) => {
              const group = statusGroup(issue.status);
              return (
                <tr
                  key={issue.id}
                  onClick={() => nav(`/issues/${issue.id}`)}
                  className="cursor-pointer transition-colors hover:bg-white/[0.045]"
                >
                  <td className="border-b border-hairline px-4 py-3 text-[12px] text-muted">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-[5px] size-2 shrink-0 rounded-full",
                          issue.type === "error" ? "bg-danger" : "bg-warning",
                        )}
                        style={{
                          boxShadow:
                            issue.type === "error"
                              ? "0 0 0 3px rgba(241,124,124,0.1)"
                              : "0 0 0 3px rgba(228,181,90,0.1)",
                        }}
                      />
                      <span>
                        <span className="block text-[12px] font-[590] text-ink">{issue.title}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-tertiary">
                          {issue.id} · {issueSource(issue)}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-hairline px-4 py-3">
                    <StatusBadge group={group} />
                  </td>
                  <td className="border-b border-hairline px-4 py-3 text-[12px] text-muted tabular-nums">
                    {issue.count.toLocaleString()}
                  </td>
                  <td className="border-b border-hairline px-4 py-3 text-[12px] text-muted">
                    {relativeTime(issue.lastSeen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-[12px] text-tertiary">
            {isLoading ? "Loading issues…" : "No issues match the selected filters."}
          </div>
        )}
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

function StatusBadge({ group }: { group: "open" | "investigating" | "fixed" }) {
  const dot = group === "open" ? "bg-danger" : group === "investigating" ? "bg-info" : "bg-success";
  const label = group === "open" ? "Open" : group === "investigating" ? "Investigating" : "Fixed";
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-hairline bg-white/[0.04] px-2 text-[10px] font-[600] text-muted">
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
