import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Spinner } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Alert'

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="container narrow section">
      <div className="card">{children}</div>
    </div>
  )
}

/** Blocks routes that require a signed-in patient. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <CenteredState>
        <p className="row">
          <Spinner />
          <span>Checking your session…</span>
        </p>
      </CenteredState>
    )
  }

  if (status === 'unconfigured') {
    return (
      <CenteredState>
        <Alert tone="info">
          <strong>Setup required.</strong> Add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>, then restart the dev server.
        </Alert>
      </CenteredState>
    )
  }

  if (status === 'signedOut') {
    // `state.from` lets us return the user to the page they originally wanted.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/** Keeps signed-in users off the sign-in / sign-up screens. */
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/dashboard'} replace />
  }

  return <Outlet />
}
