import { useRegisterCommands } from "@renderer/commands";
import { useCurrentApp } from "@renderer/context/current-app";
import { useIssue, useIssueEvents, useIssueReplays, useReplay } from "@renderer/hooks/use-issue";
import { promptAgent } from "@renderer/lib/agent-events";
import { cn, issueSource, relativeTime, statusGroup, statusLabel } from "@renderer/lib/utils";
import { RrwebReplayPlayer } from "@renderer/pages/issues/_components/RrwebReplayPlayer";
import { SourceLocation } from "@renderer/pages/issues/_components/SourceLocation";
import type { RrwebReplay } from "@traceability/protocol";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

type Tab = "stack" | "events" | "context" | "breadcrumbs" | "replay";

const TAB_LABELS: Array<{ id: Tab; label: (n: number) => string }> = [
  { id: "stack", label: () => "Stack trace" },
  { id: "events", label: (n) => `Events · ${n}` },
  { id: "context", label: () => "Context" },
  { id: "breadcrumbs", label: () => "Breadcrumbs" },
  { id: "replay", label: (n) => `Replay · ${n}` },
];

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentApp } = useCurrentApp();
  const issueQuery = useIssue(id);
  const eventsQuery = useIssueEvents(id);
  const replaysQuery = useIssueReplays(id);
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("stack");

  useEffect(() => {
    const first = replaysQuery.data?.[0]?.id;
    if (first && selectedReplayId === null) setSelectedReplayId(first);
    if (replaysQuery.data && replaysQuery.data.length === 0) setSelectedReplayId(null);
  }, [replaysQuery.data, selectedReplayId]);

  const replayQuery = useReplay(id, selectedReplayId, tab === "replay");

  useEffect(() => {
    if (issueQuery.error) toast(String(issueQuery.error));
    if (replayQuery.error) toast(String(replayQuery.error));
  }, [issueQuery.error, replayQuery.error]);

  const issue = issueQuery.data ?? null;
  const events = eventsQuery.data ?? [];
  const replays = replaysQuery.data ?? [];
  const activeReplay: RrwebReplay | null = replayQuery.data ?? null;
  const replayLoading = tab === "replay" && Boolean(selectedReplayId) && replayQuery.isLoading;
  const investigate = useCallback(() => {
    if (!issue) return;
    promptAgent({
      context: { appId: issue.appId, source: "issue", issueId: issue.id },
      prompt: `Investigate ${issue.id}`,
    });
  }, [issue]);

  useRegisterCommands(() => {
    if (!issue) return [];
    return [
      {
        id: "issue.back",
        group: { id: "issue", label: "Current issue", order: 50 },
        title: "Back to Issues",
        description: "Return to the issue list",
        icon: ArrowLeft,
        action: () => window.history.back(),
      },
      {
        id: "issue.investigate",
        group: { id: "issue", label: "Current issue", order: 50 },
        title: "Investigate current issue",
        description: issue.title,
        icon: Sparkles,
        keywords: [issue.id, issue.fingerprint],
        action: investigate,
      },
    ];
  }, [investigate, issue]);

  if (!issue)
    return (
      <div className="mx-auto block min-h-full max-w-[1260px] px-[22px] pt-[22px] pb-12">
        <div className="px-5 py-12 text-center text-[12px] text-tertiary">Loading…</div>
      </div>
    );

  return (
    <div className="mx-auto block min-h-full max-w-[1260px] px-[22px] pt-[22px] pb-12">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-tertiary transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> Issues
      </button>

      <div className="mb-5 flex items-start gap-3">
        <span
          className={cn(
            "mt-2.5 size-2.5 shrink-0 rounded-full",
            issue.type === "error" ? "bg-danger" : "bg-warning",
          )}
          style={{
            boxShadow:
              issue.type === "error"
                ? "0 0 0 3px rgba(241,124,124,0.1)"
                : "0 0 0 3px rgba(228,181,90,0.1)",
          }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[24px] font-[680] leading-[1.12] tracking-[-0.04em]">
            {issue.title}
          </h1>
          <div className="mt-1.5 font-mono text-[11px] text-tertiary">
            {issue.id} · {currentApp?.name ?? issue.appId} · production
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={investigate}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-[9px] border border-primary/40 bg-primary px-3 text-[12px] font-[590] text-[#111329] transition-colors hover:bg-primary-hover"
          >
            <Sparkles size={14} /> Investigate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4.5 desktop:grid-cols-[minmax(0,1fr)_260px]">
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white/[0.025]">
          <div className="flex gap-4.5 overflow-auto border-b border-hairline px-4">
            {TAB_LABELS.map((entry) => {
              const count =
                entry.id === "events" ? events.length : entry.id === "replay" ? replays.length : 0;
              const active = tab === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={cn(
                    "relative flex-none h-[43px] border-0 bg-transparent text-[12px] text-tertiary transition-colors hover:text-muted",
                    active && "font-[610] text-ink",
                  )}
                >
                  {entry.label(count)}
                  {active && (
                    <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-t bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {tab === "stack" && (
            <div>
              {issue.metadata.source && <SourceLocation location={issue.metadata.source} />}
              <pre className="m-0 overflow-auto bg-[#0b0c10] px-5 py-4 font-mono text-[11px] leading-[1.8] text-[#d0d3dc]">
                {issue.metadata.stacktrace ?? issue.metadata.message ?? "(no stacktrace)"}
              </pre>
            </div>
          )}

          {tab === "events" && (
            <div className="px-4 py-2">
              {events.map((e) => (
                <div
                  className="grid grid-cols-[134px_1fr] gap-3.5 border-b border-hairline py-3 text-[12px] last:border-b-0"
                  key={e.id}
                >
                  <div className="text-[11px] text-tertiary">
                    {new Date(e.receivedAt).toLocaleTimeString()}
                  </div>
                  <div className="break-all font-mono text-[11px] text-muted">
                    {e.envelope.slice(0, 160)}
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="px-5 py-12 text-center text-[12px] text-tertiary">No events.</div>
              )}
            </div>
          )}

          {tab === "context" && (
            <div className="px-4 py-2">
              <InfoRow k="Application" v={currentApp?.name ?? issue.appId} />
              <InfoRow k="Fingerprint" v={issue.fingerprint} />
              <InfoRow k="Type" v={issue.type} />
              <InfoRow k="Context" v={JSON.stringify(issue.metadata.context ?? {})} last />
            </div>
          )}

          {tab === "breadcrumbs" && (
            <div className="px-5 py-12 text-center text-[12px] text-tertiary">
              Breadcrumbs are captured inside each event envelope (see Events tab).
            </div>
          )}

          {tab === "replay" && (
            <div className="px-4 pt-3.5 pb-4">
              {replays.length > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <select
                    value={selectedReplayId ?? ""}
                    onChange={(e) => setSelectedReplayId(e.target.value || null)}
                    className="h-9 min-w-[min(420px,100%)] rounded-[9px] border border-hairline bg-surface-2 px-2.5 pr-7 text-[12px] text-muted outline-none focus:border-primary/55"
                  >
                    {replays.map((replay) => (
                      <option key={replay.id} value={replay.id}>
                        {new Date(replay.receivedAt).toLocaleString()} · {replay.eventCount} events
                      </option>
                    ))}
                  </select>
                  {activeReplay && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-success/15 px-2 py-0.5 text-[10px] font-[600] text-success">
                      {formatBytes(activeReplay.sizeBytes)}
                    </span>
                  )}
                </div>
              )}
              {replayLoading && (
                <div className="px-5 py-12 text-center text-[12px] text-tertiary">
                  Loading replay…
                </div>
              )}
              {!replayLoading && replays.length === 0 && (
                <div className="px-5 py-12 text-center text-[12px] text-tertiary">
                  No replay captured for this issue.
                </div>
              )}
              {!replayLoading && activeReplay && activeReplay.events.length === 0 && (
                <div className="px-5 py-12 text-center text-[12px] text-tertiary">
                  Replay is still uploading.
                </div>
              )}
              {!replayLoading && activeReplay && activeReplay.events.length > 0 && (
                <RrwebReplayPlayer replay={activeReplay} />
              )}
            </div>
          )}
        </section>

        <aside className="h-max overflow-hidden rounded-2xl border border-hairline bg-white/[0.025]">
          <div className="border-b border-hairline p-4 last:border-b-0">
            <div className="mb-1.5 text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
              Status
            </div>
            <StatusBadge group={statusGroup(issue.status)} />
            <SideRow label="First seen" value={relativeTime(issue.firstSeen)} />
            <SideRow label="Last seen" value={relativeTime(issue.lastSeen)} />
            <SideRow label="Total events" value={`${issue.count} events`} />
          </div>
          <div className="p-4">
            <div className="mb-1.5 text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
              Likely source
            </div>
            <div className="font-mono text-[10px] leading-[1.55] text-primary-hover">
              {issueSource(issue)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[134px_1fr] gap-3.5 py-3 text-[12px]",
        !last && "border-b border-hairline",
      )}
    >
      <div className="text-[11px] text-tertiary">{k}</div>
      <div className="break-all text-muted">{v}</div>
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="mb-1.5 mt-4 text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
        {label}
      </div>
      <div className="text-[12px] text-muted">{value}</div>
    </>
  );
}

function StatusBadge({ group }: { group: "open" | "investigating" | "fixed" }) {
  const dot = group === "open" ? "bg-danger" : group === "investigating" ? "bg-info" : "bg-success";
  const label = statusLabel(group === "open" ? "open" : group === "fixed" ? "fixed" : "fixing");
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-hairline bg-white/[0.04] px-2 text-[10px] font-[600] text-muted">
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
