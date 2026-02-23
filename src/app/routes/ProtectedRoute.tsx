import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../../features/auth/useAuth'

export function ProtectedRoute() {
  const { loading, user } = useAuth()

  if (loading) {
    return <main className="auth-shell">Checking your session...</main>
  }

  if (!user) {
    return <Navigate replace to="/auth" />
  }

  return <Outlet />
}
