import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui/primitives'
import type { Issue } from '@traceability/protocol'

export function FixSession() {
  const { issueId } = useParams<{ issueId: string }>()
  const nav = useNavigate()
  const toast = useToast()
  const [issue, setIssue] = useState<Issue | null>(null)

  const load = () => {
    if (issueId) apiFetch<Issue>(`/api/issues/${issueId}`).then(setIssue).catch((e) => toast(String(e)))
  }
  useEffect(() => { load() }, [issueId])
  if (!issue) return <div className="page"><div className="empty">Loading…</div></div>

  const cliCmd = `traceability issue show ${issue.id} --json`
  const markFixed = async () => {
    await apiFetch(`/api/issues/${issue.id}/mark-fixed`, { method: 'POST' })
    toast('Issue marked as fixed')
    load()
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(cliCmd); toast('CLI command copied') } catch { toast('Select the command to copy') }
  }

  const done = issue.status === 'fixed'
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Button sm onClick={() => nav(`/issues/${issue.id}`)}>← Issue {issue.id.slice(0, 8)}</Button>
          <h1 className="page-title" style={{ marginTop: 18 }}>AI repair session</h1>
          <p className="page-subtitle">The server is ready for a coding agent to retrieve issue context.</p>
        </div>
        <span className={`badge ${done ? 'fixed' : 'fixing'}`}><span className="dot"></span>{done ? 'Fixed' : 'Fix requested'}</span>
      </div>
      <div className="detail-grid">
        <div>
          <div className="panel" style={{ marginBottom: 18 }}>
            <div className="panel-head"><div className="panel-title">Continue in your coding agent</div></div>
            <div style={{ padding: 18 }}>
              <p className="muted" style={{ marginTop: 0 }}>Run this command in the application repository. The agent will receive the stack trace, event context and reproduction evidence.</p>
              <div className="command">
                <code>{cliCmd}</code>
                <Button sm onClick={copy}>Copy</Button>
              </div>
              <p className="muted" style={{ marginTop: 16 }}>After the agent produces a patch:</p>
              <div className="command" style={{ display: 'block', whiteSpace: 'pre', overflow: 'auto' }}>
                <code>{`traceability issue attach-patch ${issue.id} --patch ./fix.diff --branch fix-${issue.id.slice(0, 6)}
traceability issue mark-fixed ${issue.id}`}</code>
              </div>
            </div>
          </div>
        </div>
        <aside className="side-panel">
          <div className="panel-head"><div className="panel-title">Progress</div></div>
          <div className="timeline">
            <div className={`timeline-item ${issue.status !== 'open' ? 'done' : ''}`}>
              <div className="timeline-mark"></div>
              <div><div className="timeline-title">Fix requested</div><div className="timeline-time">{new Date(issue.lastSeen).toLocaleTimeString()}</div></div>
            </div>
            <div className={`timeline-item ${issue.status === 'fixing' || issue.status === 'fixed' ? 'done' : ''}`}>
              <div className="timeline-mark"></div>
              <div><div className="timeline-title">Issue retrieved by agent</div><div className="timeline-time">{issue.status === 'fixing' || issue.status === 'fixed' ? 'in progress' : 'Waiting'}</div></div>
            </div>
            <div className={`timeline-item ${issue.status === 'fixed' ? 'done' : ''}`}>
              <div className="timeline-mark"></div>
              <div><div className="timeline-title">Marked as fixed</div><div className="timeline-time">{done ? 'Done' : 'Waiting'}</div></div>
            </div>
          </div>
          {!done && (
            <div className="side-section">
              <Button variant="primary" className="full" onClick={markFixed}>Mark as fixed</Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
