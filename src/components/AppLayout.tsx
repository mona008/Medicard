import { NavLink, Link, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from './ui/Button'
import { isSupabaseConfigured, setupMessages } from '@/lib/supabase'
import { Alert } from './ui/Alert'

export function AppLayout() {
  const { status, signOut } = useAuth()

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="site-header">
        <div className="container site-header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              +
            </span>
            MediCard
          </Link>
          <nav className="site-nav" aria-label="Main">
            {status === 'signedIn' ? (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <Button variant="secondary" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <NavLink to="/login">Sign in</NavLink>
                <NavLink to="/register">Create account</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {!isSupabaseConfigured() && (
          <div className="container section">
            <Alert tone="info">
              <strong>Setup required.</strong>{' '}
              {setupMessages.join(' ')} Copy <code>.env.example</code> to <code>.env</code> and
              restart the dev server. Screens that need the database will stay unavailable until
              then.
            </Alert>
          </div>
        )}
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            MediCard stores emergency information only. It is not a medical device and does not
            provide medical advice. In an emergency, call your local emergency number.
          </p>
        </div>
      </footer>
    </div>
  )
}
