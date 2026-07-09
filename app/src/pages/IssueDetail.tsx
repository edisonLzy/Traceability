import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useToast } from '../components/Toast'
import { Button, Modal } from '../components/ui/primitives'
import type { Issue, Event } from '@traceability/protocol'

type Tab = 'stack' | 'events' | 'context' | 'breadcrumbs'

export function IssueDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const toast = useToast()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [tab, setTab] = useState<Tab>('stack')
  const [showFix, setShowFix] = useState(false)

  const load = () => {
    if (!id) return
    apiFetch<Issue>(`/api/issues/${id}`).then(setIssue).catch((e) => toast(String(e)))
    apiFetch<Event[]>(`/api/issues/${id}/events`).then(setEvents).catch(() => {})
  }
  useEffect(() => { load() }, [id])

  const startFix = async () => {
    if (!id) return
    await apiFetch(`/api/issues/${id}/fix-request`, { method: 'POST' })
    setShowFix(false)
    toast('AI repair session started')
    nav(`/fix/${id}`)
  }

  if (!issue) return <div className="page"><div className="empty">Loading…</div></div>

  return (
    <div className="page">
      <div className="issue-heading">
        <span className={`severity ${issue.type === 'error' ? '' : 'warn'}`}></span>
        <div style={{ flex: 1 }}>
          <h1>{issue.title}</h1>
          <div className="issue-id">{issue.id.slice(0, 8)} · {issue.appId.slice(0, 8)} · {issue.type}</div>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={() => setShowFix(true)}>Start AI fix</Button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="tabs">
            {(['stack', 'events', 'context', 'breadcrumbs'] as Tab[]).map((t) => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'stack' ? 'Stack trace' : t === 'events' ? `Events · ${events.length}` : t === 'context' ? 'Context' : 'Breadcrumbs'}
              </button>
            ))}
          </div>
          <div className={`tab-pane ${tab === 'stack' ? 'active' : ''}`}>
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
          {issue.status !== 'open' && issue.status !== 'fixed' && (
            <div className="side-section">
              <Button variant="primary" className="full" onClick={() => nav(`/fix/${issue.id}`)}>View fix session</Button>
            </div>
          )}
        </aside>
      </div>
      <Modal
        show={showFix}
        onClose={() => setShowFix(false)}
        title="Start AI-assisted fix?"
        subtitle="This changes the issue status to Fix requested."
        footer={<>
          <Button onClick={() => setShowFix(false)}>Cancel</Button>
          <Button variant="primary" onClick={startFix}>Start AI fix</Button>
        </>}
      >
        <p className="muted">Traceability will prepare the issue context for your coding agent. No branch, commit or merge request will be created automatically.</p>
      </Modal>
    </div>
  )
}
