import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getToken } from './auth/token'
import { connectWs } from './ws/client'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Apps } from './pages/Apps'
import { AppDetail } from './pages/AppDetail'
import { Issues } from './pages/Issues'
import { IssueDetail } from './pages/IssueDetail'
import { FixSession } from './pages/FixSession'
import { Settings } from './pages/Settings'
import { Performance } from './pages/Performance'

export function App() {
  const token = getToken()
  useEffect(() => {
    if (token) connectWs()
  }, [token])

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }
  return (
    <ToastProvider>
      <Layout>
        <Routes>
          <Route path="/login" element={<Navigate to="/apps" />} />
          <Route path="/apps" element={<Apps />} />
          <Route path="/apps/:id" element={<AppDetail />} />
          <Route path="/issues" element={<Issues />} />
          <Route path="/issues/:id" element={<IssueDetail />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/fix/:issueId" element={<FixSession />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/apps" />} />
        </Routes>
      </Layout>
    </ToastProvider>
  )
}
