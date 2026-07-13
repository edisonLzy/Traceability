import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApps, useCreateApp } from '@renderer/hooks/use-apps'
import { useToast } from '@renderer/components/Toast'
import { Button, Panel, Modal, Field } from '@renderer/components/ui/primitives'

export function AppsPage() {
  const { data } = useApps()
  const apps = data ?? []
  const createAppMutation = useCreateApp()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('master')
  const nav = useNavigate()
  const toast = useToast()

  const create = async () => {
    if (!name.trim()) { toast('Enter an application name'); return }
    try {
      const app = await createAppMutation.mutateAsync({ name, repoUrl, defaultBranch: branch })
      setShowCreate(false); setName(''); setRepoUrl(''); setBranch('master')
      toast('Application created')
      nav(`/apps/${app.id}`)
    } catch (e) {
      toast(String(e))
      return
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">Manage monitored apps, repositories and ingestion endpoints.</p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={() => setShowCreate(true)}>New application</Button>
        </div>
      </div>
      {apps.length === 0 ? (
        <div className="empty">No applications yet. Create one to get a DSN.</div>
      ) : (
        <div className="app-grid">
          {apps.map((a) => (
            <article key={a.id} className="app-card" onClick={() => nav(`/apps/${a.id}`)}>
              <div className="app-top">
                <div className="app-icon">{a.name.slice(0, 2).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="app-name">{a.name}</div>
                  <div className="app-repo">{a.repoUrl}</div>
                </div>
                <span className="badge fixed" style={{ marginLeft: 'auto' }}><span className="dot"></span>Live</span>
              </div>
              <div className="app-stats">
                <div className="app-stat"><b>{a.defaultBranch}</b><span>Default branch</span></div>
                <div className="app-stat"><b>{a.id.slice(0, 6)}</b><span>App ID</span></div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal
        show={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create application"
        subtitle="Connect a repository and generate its appId and DSN."
        footer={<>
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" onClick={create}>Create application</Button>
        </>}
      >
        <Field label="Application name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. customer-portal" />
        <Field label="Repository URL" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="git@git.example.com:team/repo.git" />
        <Field label="Default branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
      </Modal>
    </div>
  )
}
