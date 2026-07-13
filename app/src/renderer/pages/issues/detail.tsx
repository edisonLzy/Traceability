import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card } from "@renderer/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";
import { cn } from "@renderer/lib/utils";
import { RrwebReplayPlayer } from "@renderer/pages/issues/components/RrwebReplayPlayer";
import { SourceLocation } from "@renderer/pages/issues/components/SourceLocation";
import {
  useIssue,
  useIssueEvents,
  useIssueReplays,
  useReplay,
} from "@renderer/pages/issues/hooks/use-issue";
import type { RrwebReplay } from "@traceability/protocol";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

type Tab = "stack" | "events" | "context" | "breadcrumbs" | "replay";

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const issueQuery = useIssue(id);
  const eventsQuery = useIssueEvents(id);
  const replaysQuery = useIssueReplays(id);
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("stack");

  // Pick the first replay once the list loads.
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

  if (!issue)
    return (
      <div className="mx-auto block min-h-full max-w-[1440px] px-4 pt-5.5 pb-15 tablet:px-8 tablet:pt-7">
        <div className="px-5 py-13.5 text-center text-subtle">Loading…</div>
      </div>
    );

  const investigate = () => {
    window.dispatchEvent(
      new CustomEvent("traceability:agent-context", {
        detail: { appId: issue.appId, source: "issue", issueId: issue.id },
      }),
    );
    toast("Issue context attached to Traceability Agent");
  };

  const replayItems = Object.fromEntries(
    replays.map((r) => [
      r.id,
      `${new Date(r.receivedAt).toLocaleString()} · ${r.eventCount} events`,
    ]),
  );

  return (
    <div className="mx-auto block min-h-full max-w-[1440px] px-4 pt-5.5 pb-15 tablet:px-8 tablet:pt-7">
      <div className="mb-5 flex items-start gap-3">
        <span
          className={cn(
            "mt-2.5 size-2.5 shrink-0 rounded-full",
            issue.type === "error" ? "bg-danger" : "bg-warning",
          )}
        />
        <div className="flex-1">
          <h1 className="mb-2 text-2xl leading-snug tracking-[-0.5px]">{issue.title}</h1>
          <div className="mt-0.5 font-mono text-[11px] text-tertiary">
            {issue.id.slice(0, 8)} · {issue.appId.slice(0, 8)} · {issue.type}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={investigate}>
            Investigate with Agent
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4.5 desktop:grid-cols-[minmax(0,1fr)_310px]">
        <Card>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="stack">Stack trace</TabsTrigger>
              <TabsTrigger value="events">Events · {events.length}</TabsTrigger>
              <TabsTrigger value="context">Context</TabsTrigger>
              <TabsTrigger value="breadcrumbs">Breadcrumbs</TabsTrigger>
              <TabsTrigger value="replay">Replay · {replays.length}</TabsTrigger>
            </TabsList>
            <TabsContent value="stack">
              {issue.metadata.source && <SourceLocation location={issue.metadata.source} />}
              <pre className="m-0 overflow-auto bg-[#090a0b] px-5 py-4.5 font-mono text-xs leading-7 text-[#c7cbd3]">
                {issue.metadata.stacktrace ?? issue.metadata.message ?? "(no stacktrace)"}
              </pre>
            </TabsContent>
            <TabsContent value="events">
              <div className="px-4.5 py-2">
                {events.map((e) => (
                  <div
                    className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs last:border-b-0"
                    key={e.id}
                  >
                    <div className="text-[11px] text-tertiary">
                      {new Date(e.receivedAt).toLocaleTimeString()}
                    </div>
                    <div className="break-all font-medium text-muted">
                      {e.envelope.slice(0, 120)}…
                    </div>
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="px-5 py-13.5 text-center text-subtle">No events.</div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="context">
              <div className="px-4.5 py-2">
                <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs">
                  <div className="text-[11px] text-tertiary">type</div>
                  <div className="break-all font-medium text-muted">{issue.type}</div>
                </div>
                <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs">
                  <div className="text-[11px] text-tertiary">fingerprint</div>
                  <div className="break-all font-medium text-muted">{issue.fingerprint}</div>
                </div>
                <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs last:border-b-0">
                  <div className="text-[11px] text-tertiary">context</div>
                  <div className="break-all font-medium text-muted">
                    {JSON.stringify(issue.metadata.context ?? {})}
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="breadcrumbs">
              <div className="px-5 py-13.5 text-center text-subtle">
                Breadcrumbs are captured inside each event envelope (see Events tab).
              </div>
            </TabsContent>
            <TabsContent value="replay">
              <div className="px-4.5 pt-3.5 pb-4.5">
                {replays.length > 0 && (
                  <div className="mb-3.5 flex items-center gap-2.5">
                    <Select
                      value={selectedReplayId}
                      onValueChange={(v) => setSelectedReplayId(v)}
                      items={replayItems}
                    >
                      <SelectTrigger className="min-w-[min(420px,100%)]">
                        <SelectValue placeholder="Select a replay" />
                      </SelectTrigger>
                      <SelectContent>
                        {replays.map((replay) => (
                          <SelectItem key={replay.id} value={replay.id}>
                            {new Date(replay.receivedAt).toLocaleString()} · {replay.eventCount}{" "}
                            events
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {activeReplay && (
                      <Badge variant="fixed">{formatBytes(activeReplay.sizeBytes)}</Badge>
                    )}
                  </div>
                )}
                {replayLoading && (
                  <div className="px-5 py-13.5 text-center text-subtle">Loading replay…</div>
                )}
                {!replayLoading && replays.length === 0 && (
                  <div className="px-5 py-13.5 text-center text-subtle">
                    No replay captured for this issue.
                  </div>
                )}
                {!replayLoading && activeReplay && activeReplay.events.length === 0 && (
                  <div className="px-5 py-13.5 text-center text-subtle">
                    Replay is still uploading.
                  </div>
                )}
                {!replayLoading && activeReplay && activeReplay.events.length > 0 && (
                  <RrwebReplayPlayer replay={activeReplay} />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
        <aside className="h-max order-first overflow-hidden rounded-xl border border-hairline bg-surface-1 desktop:order-none">
          <div className="border-b border-hairline p-4 last:border-b-0">
            <div className="mb-2 text-[11px] text-tertiary">Status</div>
            <Badge
              variant={
                issue.status === "open" ? "open" : issue.status === "fixed" ? "fixed" : "fixing"
              }
            >
              {issue.status}
            </Badge>
            <div className="mb-2 mt-4 text-[11px] text-tertiary">First seen</div>
            <div className="text-xs font-medium text-muted">
              {new Date(issue.firstSeen).toLocaleString()}
            </div>
            <div className="mb-2 mt-4 text-[11px] text-tertiary">Last seen</div>
            <div className="text-xs font-medium text-muted">
              {new Date(issue.lastSeen).toLocaleString()}
            </div>
            <div className="mb-2 mt-4 text-[11px] text-tertiary">Total events</div>
            <div className="text-xs font-medium text-muted">{issue.count} events</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
