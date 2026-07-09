import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken, setServer } from '../auth/token'
import { Button, Field } from '../components/ui/primitives'

export function Login() {
  const [server, setServerState] = useState('http://localhost:3000')
  const [token, setTokenState] = useState('')
  const nav = useNavigate()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setServer(server)
    setToken(token)
    nav('/apps')
  }
  return (
    <div className="shell" style={{ placeItems: 'center' }}>
      <form onSubmit={submit} className="panel" style={{ width: 380, padding: 24 }}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark">T</span>
          <span>Traceability</span>
        </div>
        <Field label="Server URL" value={server} onChange={(e) => setServerState(e.target.value)} />
        <div style={{ height: 15 }} />
        <Field label="API token" type="password" value={token} onChange={(e) => setTokenState(e.target.value)} placeholder="dev-token" />
        <div style={{ marginTop: 18 }}>
          <Button variant="primary" type="submit" className="full">Login</Button>
        </div>
      </form>
    </div>
  )
}
