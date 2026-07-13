import React, { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const show_ = useCallback((m: string) => {
    setMsg(m)
    setShow(true)
    setTimeout(() => setShow(false), 2200)
  }, [])
  return (
    <ToastCtx.Provider value={show_}>
      {children}
      <div className={`toast ${show ? 'show' : ''}`}>{msg}</div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
