import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAuth, saveConnection } from '../../auth/token'
import { apiFetch } from '../../api/client'
import { Button, Field } from '../../components/ui/primitives'

export function Login() {
  const [server, setServerState] = useState('http://localhost:3000')
  const [token, setTokenState] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nav = useNavigate()
  const connect = async () => {
    if (!token.trim()) {
      setError('Enter an API token to connect')
      return
    }
    setError('')
    setSaving(true)
    try {
      await saveConnection({ serverUrl: server, token })
      await apiFetch('/api/apps')
      nav('/issues')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      await clearAuth()
    } finally {
      setSaving(false)
    }
  }
  return (
    <main className="grid min-h-screen w-full place-items-center bg-canvas px-6 py-10 text-ink">
      <section className="w-full max-w-md rounded-2xl border border-hairline bg-surface-1 p-7 shadow-2xl shadow-black/30" aria-labelledby="connection-title">
        <div className="mb-7 flex items-center gap-3 text-base font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-white shadow-[inset_0_1px_rgb(255_255_255_/_0.18)]">T</span>
          <h1 id="connection-title">Traceability</h1>
        </div>
        <Field label="Server URL" value={server} onChange={(e) => setServerState(e.target.value)} />
        <div className="h-4" />
        <Field
          label="API token"
          type="password"
          value={token}
          onChange={(e) => setTokenState(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void connect()
          }}
          placeholder="dev-token"
        />
        {error && <p className="form-error">{error}</p>}
        <div className="mt-5">
          <Button variant="primary" type="button" className="full" disabled={saving} onClick={() => void connect()}>{saving ? 'Connecting…' : 'Connect'}</Button>
        </div>
      </section>
    </main>
  )
}
