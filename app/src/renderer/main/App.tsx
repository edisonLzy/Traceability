import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { bootstrapConnection, getToken, onConnectionChange } from '../auth/token'
import { ToastProvider } from '../components/Toast'
import { connectWs } from '../ws/client'
import { Layout } from './Layout'
import { AppDetail } from './pages/AppDetail'
import { Apps } from './pages/Apps'
import { IssueDetail } from './pages/IssueDetail'
import { Issues } from './pages/Issues'
import { Login } from './pages/Login'
import { Performance } from './pages/Performance'
import { Settings } from './pages/Settings'

export function App() {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState(getToken())

  useEffect(() => {
    void bootstrapConnection().finally(() => setReady(true))
    return onConnectionChange((next) => setToken(next?.token ?? null))
  }, [])

  useEffect(() => {
    if (token) connectWs()
  }, [token])

  if (!ready) return <div className="boot-screen">Opening Traceability…</div>

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Navigate to="/issues" replace />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/issues" replace />} />
          <Route path="apps" element={<Apps />} />
          <Route path="apps/:id" element={<AppDetail />} />
          <Route path="issues" element={<Issues />} />
          <Route path="issues/:id" element={<IssueDetail />} />
          <Route path="performance" element={<Performance />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/issues" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  )
}
