import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../../features/auth/useAuth'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/outcomes', label: 'Outcomes' },
  { to: '/metrics', label: 'Metrics' },
  { to: '/weekly-review', label: 'Weekly Review' },
  { to: '/settings', label: 'Settings' },
]

export function AppLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="shell">
      <header className="topbar panel">
        <div>
          <p className="eyebrow">Outcome & Output Framework</p>
          <p className="brand">Outputs To Outcomes</p>
        </div>

        <nav className="nav-links" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
              end={link.to === '/'}
              key={link.to}
              to={link.to}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="account-zone">
          <p className="account-email" title={user?.email ?? ''}>
            {user?.email ?? 'No user'}
          </p>
          <button className="btn btn-secondary" onClick={() => void signOut()} type="button">
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
