import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useIssue, useIssueEvents, useIssueReplays, useReplay } from '@renderer/hooks/use-issue'
import { RrwebReplayPlayer } from '@renderer/components/RrwebReplayPlayer'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { codeClass, emptyClass, pageClass } from '@renderer/components/ui/styles'
import { cn } from '@renderer/lib/utils'
import type { Issue, RrwebReplay } from '@traceability/protocol'

type Tab = 'stack' | 'events' | 'context' | 'breadcrumbs' | 'replay'

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const issueQuery = useIssue(id)
  const eventsQuery = useIssueEvents(id)
  const replaysQuery = useIssueReplays(id)
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('stack')

  // Pick the first replay once the list loads.
  useEffect(() => {
    const first = replaysQuery.data?.[0]?.id
    if (first && selectedReplayId === null) setSelectedReplayId(first)
    if (replaysQuery.data && replaysQuery.data.length === 0) setSelectedReplayId(null)
  }, [replaysQuery.data, selectedReplayId])

  const replayQuery = useReplay(id, selectedReplayId, tab === 'replay')

  useEffect(() => {
    if (issueQuery.error) toast(String(issueQuery.error))
    if (replayQuery.error) toast(String(replayQuery.error))
  }, [issueQuery.error, replayQuery.error])

  const issue = issueQuery.data ?? null
  const events = eventsQuery.data ?? []
  const replays = replaysQuery.data ?? []
  const activeReplay: RrwebReplay | null = replayQuery.data ?? null
  const replayLoading = tab === 'replay' && Boolean(selectedReplayId) && replayQuery.isLoading

  if (!issue) return <div className={pageClass}><div className={emptyClass}>Loading…</div></div>

  const investigate = () => {
    window.dispatchEvent(new CustomEvent('traceability:agent-context', {
      detail: { appId: issue.appId, source: 'issue', issueId: issue.id },
    }))
    toast('Issue context attached to Traceability Agent')
  }

  const replayItems = Object.fromEntries(
    replays.map((r) => [r.id, `${new Date(r.receivedAt).toLocaleString()} · ${r.eventCount} events`]),
  )

  return (
    <div className={pageClass}>
      <div className="mb-5 flex items-start gap-3">
        <span className={cn('mt-2.5 size-2.5 shrink-0 rounded-full', issue.type === 'error' ? 'bg-danger' : 'bg-warning')} />
        <div className="flex-1">
          <h1 className="mb-2 text-2xl leading-snug tracking-[-0.5px]">{issue.title}</h1>
          <div className="mt-0.5 font-mono text-[11px] text-tertiary">{issue.id.slice(0, 8)} · {issue.appId.slice(0, 8)} · {issue.type}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={investigate}>Investigate with Agent</Button>
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
              <pre className={codeClass}>{issue.metadata.stacktrace ?? issue.metadata.message ?? '(no stacktrace)'}</pre>
            </TabsContent>
            <TabsContent value="events">
              <div className="px-4.5 py-2">
                {events.map((e) => (
                  <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs last:border-b-0" key={e.id}>
                    <div className="text-[11px] text-tertiary">{new Date(e.receivedAt).toLocaleTimeString()}</div>
                    <div className="break-all font-medium text-muted">{e.envelope.slice(0, 120)}…</div>
                  </div>
                ))}
                {events.length === 0 && <div className={emptyClass}>No events.</div>}
              </div>
            </TabsContent>
            <TabsContent value="context">
              <div className="px-4.5 py-2">
                <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs"><div className="text-[11px] text-tertiary">type</div><div className="break-all font-medium text-muted">{issue.type}</div></div>
                <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs"><div className="text-[11px] text-tertiary">fingerprint</div><div className="break-all font-medium text-muted">{issue.fingerprint}</div></div>
                <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs last:border-b-0"><div className="text-[11px] text-tertiary">context</div><div className="break-all font-medium text-muted">{JSON.stringify(issue.metadata.context ?? {})}</div></div>
              </div>
            </TabsContent>
            <TabsContent value="breadcrumbs">
              <div className={emptyClass}>Breadcrumbs are captured inside each event envelope (see Events tab).</div>
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
                            {new Date(replay.receivedAt).toLocaleString()} · {replay.eventCount} events
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {activeReplay && (
                      <Badge variant="fixed">{formatBytes(activeReplay.sizeBytes)}</Badge>
                    )}
                  </div>
                )}
                {replayLoading && <div className={emptyClass}>Loading replay…</div>}
                {!replayLoading && replays.length === 0 && <div className={emptyClass}>No replay captured for this issue.</div>}
                {!replayLoading && activeReplay && activeReplay.events.length === 0 && (
                  <div className={emptyClass}>Replay is still uploading.</div>
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
            <Badge variant={issue.status === 'open' ? 'open' : issue.status === 'fixed' ? 'fixed' : 'fixing'}>
              {issue.status}
            </Badge>
            <div className="mb-2 mt-4 text-[11px] text-tertiary">First seen</div>
            <div className="text-xs font-medium text-muted">{new Date(issue.firstSeen).toLocaleString()}</div>
            <div className="mb-2 mt-4 text-[11px] text-tertiary">Last seen</div>
            <div className="text-xs font-medium text-muted">{new Date(issue.lastSeen).toLocaleString()}</div>
            <div className="mb-2 mt-4 text-[11px] text-tertiary">Total events</div>
            <div className="text-xs font-medium text-muted">{issue.count} events</div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SourceLocation({ location }: { location: NonNullable<Issue['metadata']['source']> }) {
  return (
    <div className="border-b border-hairline bg-surface-2">
      <div className="flex items-start justify-between gap-3 px-4.5 py-3.5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-tertiary">Source map resolved location</div>
          <div className="mt-1 break-all font-mono text-xs text-[#bfc7ff]">{location.file}:{location.line}:{location.column}</div>
        </div>
        {location.function && <Badge variant="fixed">{location.function}</Badge>}
      </div>
      {location.context && (
        <pre className={cn(codeClass, 'max-h-50 border-y border-hairline')}>
          {location.context.lines.map((line, index) => {
            const lineNumber = location.context!.startLine + index
            return (
              <span className={cn('block', lineNumber === location.context!.errorLine && '-mx-5 bg-primary/15 px-5 text-white')} key={lineNumber}>
                <span className="inline-block w-7.5 select-none text-[#474b52]">{lineNumber}</span>
                {line}
              </span>
            )
          })}
        </pre>
      )}
      {location.generated && <div className="px-4.5 py-2 font-mono text-[11px] text-tertiary">Generated: {location.generated.file}:{location.generated.line}:{location.generated.column}</div>}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
