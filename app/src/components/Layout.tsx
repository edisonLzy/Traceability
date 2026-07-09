import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { clearAuth } from '../auth/token'
import { CommandPalette } from './CommandPalette'

export function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const crumb = loc.pathname.startsWith('/apps')
    ? 'Applications'
    : loc.pathname.startsWith('/issues')
    ? 'Issues'
    : loc.pathname.startsWith('/fix')
    ? 'AI repair'
    : loc.pathname.startsWith('/settings')
    ? 'SDK setup'
    : 'Issues'
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>Traceability</span>
        </div>
        <div className="workspace">
          <div className="workspace-avatar">FE</div>
          <div className="workspace-copy">
            <div className="workspace-name">Frontend Platform</div>
            <div className="workspace-role">Engineering</div>
          </div>
          <span className="muted">⌄</span>
        </div>
        <nav>
          <div className="nav-label">Workspace</div>
          <NavLink to="/issues" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">◇</span>Issues
          </NavLink>
          <NavLink to="/apps" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">▦</span>Applications
          </NavLink>
          <div className="nav-label">Manage</div>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">⌁</span>SDK setup
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="user">
            <div className="avatar">LY</div>
            <div className="user-meta">
              <div className="user-name">研发</div>
              <div className="user-email" style={{ cursor: 'pointer' }} onClick={() => { clearAuth(); location.href = '/login' }}>
                Sign out
              </div>
            </div>
          </div>
        </div>
      </aside>
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
        <div className="content">{children}</div>
      </main>
      <CommandPalette />
    </div>
  )
}
