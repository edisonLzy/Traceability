import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useApps } from '@renderer/hooks/use-apps'
import { useCreateApp } from '@renderer/pages/apps/hooks/use-create-app'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'

export function AppsPage() {
  const { data } = useApps()
  const apps = data ?? []
  const createAppMutation = useCreateApp()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('master')
  const nav = useNavigate()

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
    <div className="mx-auto block min-h-full max-w-[1440px] px-4 pt-5.5 pb-15 tablet:px-8 tablet:pt-7">
      <div className="mb-7 flex items-start justify-between gap-3.5">
        <div>
          <h1 className="m-0 text-2xl leading-tight font-semibold tracking-[-0.7px] tablet:text-[28px]">Applications</h1>
          <p className="mt-1.5 text-subtle">Manage monitored apps, repositories and ingestion endpoints.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => setShowCreate(true)}>New application</Button>
        </div>
      </div>
      {apps.length === 0 ? (
        <div className="px-5 py-13.5 text-center text-subtle">No applications yet. Create one to get a DSN.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
          {apps.map((a) => (
            <article key={a.id} className="cursor-pointer rounded-xl border border-hairline bg-surface-1 p-4.5 transition-colors hover:border-hairline-strong hover:bg-surface-2" onClick={() => nav(`/apps/${a.id}`)}>
              <div className="flex items-start gap-3">
                <div className="grid size-9.5 place-items-center rounded-lg bg-[#202128] font-semibold text-muted">{a.name.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="font-medium">{a.name}</div>
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-tertiary">{a.repoUrl}</div>
                </div>
                <Badge variant="fixed" className="ml-auto">Live</Badge>
              </div>
              <div className="mt-5 flex gap-6">
                <div><b className="block text-lg font-semibold">{a.defaultBranch}</b><span className="text-[11px] text-tertiary">Default branch</span></div>
                <div><b className="block text-lg font-semibold">{a.id.slice(0, 6)}</b><span className="text-[11px] text-tertiary">App ID</span></div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create application</DialogTitle>
            <DialogDescription>Connect a repository and generate its appId and DSN.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Application name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. customer-portal" />
            <Field label="Repository URL" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="git@git.example.com:team/repo.git" />
            <Field label="Default branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" onClick={create}>Create application</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
