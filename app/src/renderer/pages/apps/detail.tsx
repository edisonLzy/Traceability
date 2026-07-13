import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '@renderer/lib/request'
import { useToast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/primitives'
import type { Application } from '@traceability/protocol'

export function AppDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [app, setApp] = useState<Application | null>(null)
  const nav = useNavigate()
  const toast = useToast()
  useEffect(() => {
    if (id) apiFetch<Application>(`/api/apps/${id}`).then(setApp).catch((e) => toast(String(e)))
  }, [id])
  if (!app) return <div className="page"><div className="empty">Loading…</div></div>

  const dsn = `${location.origin.replace(/:\d+$/, ':3000')}/api/ingest/envelope/${app.id}`

  const del = async () => {
    try {
      await apiFetch(`/api/apps/${app.id}`, { method: 'DELETE' })
    } catch (e) {
      toast(String(e))
      return
    }
    toast('Application deleted')
    nav('/apps')
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Button sm onClick={() => nav('/apps')}>← Applications</Button>
          <h1 className="page-title" style={{ marginTop: 18 }}>{app.name}</h1>
          <p className="page-subtitle">{app.defaultBranch} · created {new Date(app.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={() => nav(`/issues?appId=${app.id}`)}>View issues</Button>
          <Button onClick={() => nav(`/performance?appId=${app.id}`)}>View performance</Button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">SDK connection</div>
            <span className="badge fixed" style={{ marginLeft: 'auto' }}><span className="dot"></span>Receiving events</span>
          </div>
          <div className="info-list">
            <div className="info-row"><div className="info-key">App ID</div><div className="info-value">{app.id}</div></div>
            <div className="info-row"><div className="info-key">DSN</div><div className="info-value">{dsn}</div></div>
            <div className="info-row"><div className="info-key">Repository</div><div className="info-value">{app.repoUrl}</div></div>
            <div className="info-row"><div className="info-key">Default branch</div><div className="info-value">{app.defaultBranch}</div></div>
          </div>
        </div>
        <aside className="side-panel">
          <div className="side-section">
            <div className="side-label">Created</div>
            <div className="side-value">{new Date(app.createdAt).toLocaleString()}</div>
          </div>
          <div className="side-section">
            <Button variant="danger" className="full" onClick={del}>Delete application</Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
