import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getToken } from './auth/token'
import { connectWs } from './ws/client'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'

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
          {/* pages added in Tasks 17/18 */}
          <Route path="*" element={<div className="page">Not found</div>} />
        </Routes>
      </Layout>
    </ToastProvider>
  )
}
