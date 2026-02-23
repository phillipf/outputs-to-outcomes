import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from './layout/AppLayout'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { AuthProvider } from '../features/auth/AuthContext'
import { AuthPage } from '../features/auth/AuthPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { MetricsPage } from '../features/metrics/MetricsPage'
import { OutcomesPage } from '../features/outcomes/OutcomesPage'
import { WeeklyReviewPage } from '../features/review/WeeklyReviewPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AuthPage />} path="/auth" />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route element={<DashboardPage />} index path="/" />
              <Route element={<OutcomesPage />} path="/outcomes" />
              <Route element={<MetricsPage />} path="/metrics" />
              <Route element={<WeeklyReviewPage />} path="/weekly-review" />
              <Route element={<SettingsPage />} path="/settings" />
            </Route>
          </Route>

          <Route element={<Navigate replace to="/" />} path="*" />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
