import { NavLink } from 'react-router-dom'

export function Sidebar() {
  return (
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
        <NavLink to="/performance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">◴</span>Performance
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
            <div className="user-email">dev@local</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
