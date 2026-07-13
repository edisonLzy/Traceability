import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Kbd } from '@renderer/components/ui/kbd'

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
      <div className="fixed inset-0 z-20 bg-black/75" onClick={() => setOpen(false)} />
      <div className="fixed top-[18%] left-1/2 z-25 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-hairline-strong bg-surface-2">
        <input
          placeholder="Search pages and actions…"
          autoFocus
          className="h-13 w-full border-0 border-b border-hairline bg-transparent px-4.5 text-[15px] text-ink outline-none placeholder:text-tertiary"
        />
        <div className="p-1.5">
          {ACTIONS.map((a) => (
            <div
              key={a.to}
              className="flex items-center gap-3 rounded-md p-2.5 text-muted hover:bg-surface-3"
              onClick={() => {
                nav(a.to)
                setOpen(false)
              }}
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
              <Kbd className="ml-auto">{a.key}</Kbd>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
