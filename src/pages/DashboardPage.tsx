import { useAuth } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'

/**
 * Phase 1 placeholder. Phases 3-7 replace this with the real dashboard
 * (medical profile, contacts, medical card + QR, AI summary, admin).
 */
export function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="container section">
      <h1 className="h1">Dashboard</h1>
      <p className="muted">Signed in as {user?.email}</p>

      <div className="card stack">
        <Alert tone="info">
          Your account is ready. Medical profile, emergency contacts, and the digital medical
          card arrive in the next build phases.
        </Alert>
        <div className="safety-note">
          <strong>Use synthetic data only.</strong> Do not enter real patient medical
          information during development or testing.
        </div>
      </div>
    </div>
  )
}
