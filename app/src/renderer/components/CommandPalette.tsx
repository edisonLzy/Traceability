import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ACTIONS: Array<{ icon: string; label: string; to: string; key: string }> = [
  { icon: '◇', label: 'Go to Issues', to: '/issues', key: 'G then I' },
  { icon: '▦', label: 'Go to Applications', to: '/apps', key: 'G then A' },
  { icon: '⌁', label: 'Go to SDK setup', to: '/settings', key: 'G then S' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  if (!open) return null
  return (
    <>
      <div className="modal-backdrop show" onClick={() => setOpen(false)} />
      <div className="palette show">
        <input placeholder="Search pages and actions…" autoFocus />
        <div className="palette-list">
          {ACTIONS.map((a) => (
            <div
              key={a.to}
              className="palette-item"
              onClick={() => {
                nav(a.to)
                setOpen(false)
              }}
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
              <span className="kbd palette-key">{a.key}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
