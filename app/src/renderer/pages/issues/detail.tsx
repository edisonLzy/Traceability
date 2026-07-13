import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useIssue, useIssueEvents, useIssueReplays, useReplay } from '@renderer/hooks/use-issue'
import { RrwebReplayPlayer } from '@renderer/components/RrwebReplayPlayer'
import { useToast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/primitives'
import type { Issue, RrwebReplay } from '@traceability/protocol'

type Tab = 'stack' | 'events' | 'context' | 'breadcrumbs' | 'replay'

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
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
  }, [issueQuery.error, replayQuery.error, toast])

  const issue = issueQuery.data ?? null
  const events = eventsQuery.data ?? []
  const replays = replaysQuery.data ?? []
  const activeReplay: RrwebReplay | null = replayQuery.data ?? null
  const replayLoading = tab === 'replay' && Boolean(selectedReplayId) && replayQuery.isLoading

  if (!issue) return <div className="page"><div className="empty">Loading…</div></div>

  const investigate = () => {
    window.dispatchEvent(new CustomEvent('traceability:agent-context', {
      detail: { appId: issue.appId, source: 'issue', issueId: issue.id },
    }))
    toast('Issue context attached to Traceability Agent')
  }

  return (
    <div className="page">
      <div className="issue-heading">
        <span className={`severity ${issue.type === 'error' ? '' : 'warn'}`}></span>
        <div style={{ flex: 1 }}>
          <h1>{issue.title}</h1>
          <div className="issue-id">{issue.id.slice(0, 8)} · {issue.appId.slice(0, 8)} · {issue.type}</div>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={investigate}>Investigate with Agent</Button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="tabs">
            {(['stack', 'events', 'context', 'breadcrumbs', 'replay'] as Tab[]).map((t) => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'stack'
                  ? 'Stack trace'
                  : t === 'events'
                    ? `Events · ${events.length}`
                    : t === 'context'
                      ? 'Context'
                      : t === 'breadcrumbs'
                        ? 'Breadcrumbs'
                        : `Replay · ${replays.length}`}
              </button>
            ))}
          </div>
          <div className={`tab-pane ${tab === 'stack' ? 'active' : ''}`}>
            {issue.metadata.source && <SourceLocation location={issue.metadata.source} />}
            <pre className="code">{issue.metadata.stacktrace ?? issue.metadata.message ?? '(no stacktrace)'}</pre>
          </div>
          <div className={`tab-pane ${tab === 'events' ? 'active' : ''}`}>
            <div className="info-list">
              {events.map((e) => (
                <div className="info-row" key={e.id}>
                  <div className="info-key">{new Date(e.receivedAt).toLocaleTimeString()}</div>
                  <div className="info-value">{e.envelope.slice(0, 120)}…</div>
                </div>
              ))}
              {events.length === 0 && <div className="empty">No events.</div>}
            </div>
          </div>
          <div className={`tab-pane ${tab === 'context' ? 'active' : ''}`}>
            <div className="info-list">
              <div className="info-row"><div className="info-key">type</div><div className="info-value">{issue.type}</div></div>
              <div className="info-row"><div className="info-key">fingerprint</div><div className="info-value">{issue.fingerprint}</div></div>
              <div className="info-row"><div className="info-key">context</div><div className="info-value">{JSON.stringify(issue.metadata.context ?? {})}</div></div>
            </div>
          </div>
          <div className={`tab-pane ${tab === 'breadcrumbs' ? 'active' : ''}`}>
            <div className="empty">Breadcrumbs are captured inside each event envelope (see Events tab).</div>
          </div>
          <div className={`tab-pane ${tab === 'replay' ? 'active' : ''}`}>
            <div className="replay-pane">
              {replays.length > 0 && (
                <div className="replay-toolbar">
                  <select
                    className="select"
                    value={selectedReplayId ?? ''}
                    onChange={(e) => {
                      setSelectedReplayId(e.target.value)
                    }}
                  >
                    {replays.map((replay) => (
                      <option key={replay.id} value={replay.id}>
                        {new Date(replay.receivedAt).toLocaleString()} · {replay.eventCount} events
                      </option>
                    ))}
                  </select>
                  {activeReplay && (
                    <span className="badge fixed"><span className="dot"></span>{formatBytes(activeReplay.sizeBytes)}</span>
                  )}
                </div>
              )}
              {replayLoading && <div className="empty">Loading replay…</div>}
              {!replayLoading && replays.length === 0 && <div className="empty">No replay captured for this issue.</div>}
              {!replayLoading && activeReplay && activeReplay.events.length === 0 && (
                <div className="empty">Replay is still uploading.</div>
              )}
              {!replayLoading && activeReplay && activeReplay.events.length > 0 && (
                <RrwebReplayPlayer replay={activeReplay} />
              )}
            </div>
          </div>
        </div>
        <aside className="side-panel">
          <div className="side-section">
            <div className="side-label">Status</div>
            <span className={`badge ${issue.status === 'open' ? 'open' : issue.status === 'fixed' ? 'fixed' : 'fixing'}`}><span className="dot"></span>{issue.status}</span>
            <div className="side-label">First seen</div>
            <div className="side-value">{new Date(issue.firstSeen).toLocaleString()}</div>
            <div className="side-label">Last seen</div>
            <div className="side-value">{new Date(issue.lastSeen).toLocaleString()}</div>
            <div className="side-label">Total events</div>
            <div className="side-value">{issue.count} events</div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SourceLocation({ location }: { location: NonNullable<Issue['metadata']['source']> }) {
  return (
    <div className="source-location">
      <div className="source-location-head">
        <div>
          <div className="source-location-label">Source map resolved location</div>
          <div className="source-location-path">{location.file}:{location.line}:{location.column}</div>
        </div>
        {location.function && <span className="badge fixed">{location.function}</span>}
      </div>
      {location.context && (
        <pre className="code source-context">
          {location.context.lines.map((line, index) => {
            const lineNumber = location.context!.startLine + index
            return <span className={`line ${lineNumber === location.context!.errorLine ? 'hot' : ''}`} key={lineNumber}><span className="ln">{lineNumber}</span>{line}</span>
          })}
        </pre>
      )}
      {location.generated && <div className="source-location-generated">Generated: {location.generated.file}:{location.generated.line}:{location.generated.column}</div>}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
