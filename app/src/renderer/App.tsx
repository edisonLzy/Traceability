import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { ToastProvider } from '@renderer/components/Toast'
import { connectWs } from '@renderer/lib/ws'
import { router } from '@renderer/router'
import { bootstrapConnection, useAuth } from '@renderer/store/auth'

export function App() {
  const credentials = useAuth()
  const token = credentials?.token ?? null
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void bootstrapConnection().finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (token) connectWs()
  }, [token])

  if (!ready) return <div className="boot-screen">Opening Traceability…</div>

  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  )
}
