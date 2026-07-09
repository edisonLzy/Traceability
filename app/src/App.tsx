import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getToken } from './auth/token'
import { connectWs } from './ws/client'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Apps } from './pages/Apps'
import { AppDetail } from './pages/AppDetail'

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
          <Route path="*" element={<Navigate to="/apps" />} />
        </Routes>
      </Layout>
    </ToastProvider>
  )
}
