import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { onIssueEvent } from '../ws/client'
import { Button } from '../components/ui/primitives'
import type { Issue, IssueStatus } from '@traceability/protocol'

export function Issues() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const appId = params.get('appId') ?? ''
  const status = (params.get('status') ?? 'all') as 'all' | IssueStatus
  const [q, setQ] = useState('')
  const [issues, setIssues] = useState<Issue[]>([])

  const load = () => {
    const qs = new URLSearchParams()
    if (appId) qs.set('appId', appId)
    qs.set('limit', '100')
    apiFetch<{ items: Issue[] }>(`/api/issues?${qs}`).then((r) => setIssues(r.items))
  }
  useEffect(() => { load() }, [appId])
  useEffect(() => onIssueEvent(() => load()), [])

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (status !== 'all' && i.status !== status) return false
      if (q && !`${i.title} ${i.id} ${i.metadata.message ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [issues, status, q])

  const open = issues.filter((i) => i.status === 'open').length
  const fixing = issues.filter((i) => i.status === 'fix-manual' || i.status === 'fixing').length
  const fixed = issues.filter((i) => i.status === 'fixed').length
  const events24h = issues.reduce((n, i) => n + i.count, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Issues</h1>
          <p className="page-subtitle">Triage errors across all monitored applications.</p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={() => nav('/apps')}>Manage applications</Button>
        </div>
      </div>
      <div className="metrics">
        <div className="metric"><div className="metric-label">Open issues</div><div className="metric-value">{open}</div></div>
        <div className="metric"><div className="metric-label">Events · total</div><div className="metric-value">{events24h}</div></div>
        <div className="metric"><div className="metric-label">Fixing</div><div className="metric-value">{fixing}</div></div>
        <div className="metric"><div className="metric-label">Resolved</div><div className="metric-value">{fixed}</div></div>
      </div>
      <div className="toolbar">
        <div className="search">
          <span>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search issues…" />
        </div>
        <select className="select" value={appId} onChange={(e) => setParams(e.target.value ? { appId: e.target.value } : {})}>
          <option value="">All applications</option>
        </select>
        <select className="select" value={status} onChange={(e) => setParams({ ...(appId ? { appId } : {}), status: e.target.value })}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="fix-manual">Fix requested</option>
          <option value="fixing">Fixing</option>
          <option value="fixed">Fixed</option>
        </select>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">All issues</div>
          <div className="panel-meta">{filtered.length} issue{filtered.length === 1 ? '' : 's'}</div>
        </div>
        <table className="data-table">
          <thead><tr><th>Issue</th><th>Status</th><th>Events</th><th>Last seen</th></tr></thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => nav(`/issues/${i.id}`)}>
                <td>
                  <div className="issue-main">
                    <span className={`severity ${i.type === 'error' ? '' : 'warn'}`}></span>
                    <div>
                      <div className="issue-title">{i.title}</div>
                      <div className="issue-sub">{i.id.slice(0, 8)} · {i.appId.slice(0, 8)}</div>
                    </div>
                  </div>
                </td>
                <td><span className={`badge ${i.status === 'open' ? 'open' : i.status === 'fixed' ? 'fixed' : 'fixing'}`}><span className="dot"></span>{i.status === 'open' ? 'Open' : i.status === 'fixed' ? 'Fixed' : 'Fix requested'}</span></td>
                <td className="muted">{i.count}</td>
                <td className="muted">{new Date(i.lastSeen).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty">No issues match these filters.</div>}
      </div>
    </div>
  )
}
