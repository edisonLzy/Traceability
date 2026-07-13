import type { ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AgentPanel } from '@renderer/components/AgentPanel'
import { CommandPalette } from '@renderer/components/CommandPalette'
import { Sidebar } from '@renderer/components/Sidebar'

interface LayoutProps {
  sidebar?: ReactNode
  agent?: ReactNode
}

export function Layout({ sidebar = <Sidebar />, agent = <AgentPanel /> }: LayoutProps) {
  const location = useLocation()
  const crumb = location.pathname.startsWith('/apps')
    ? 'Applications'
    : location.pathname.startsWith('/issues')
      ? 'Issues'
      : location.pathname.startsWith('/performance')
        ? 'Performance'
        : location.pathname.startsWith('/settings')
          ? 'SDK setup'
          : 'Issues'

  return (
    <div className="shell">
      {sidebar}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Frontend Platform</span>
            <span className="slash">/</span>
            <b>{crumb}</b>
          </div>
          <div className="top-actions">
            <button className="btn btn-sm">Search or jump to… <span className="kbd">⌘ K</span></button>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>
      {agent}
      <CommandPalette />
    </div>
  )
}
