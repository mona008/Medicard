import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

export function LandingPage() {
  const { status } = useAuth()

  return (
    <div className="container section">
      <section className="card" style={{ padding: 'clamp(1.5rem, 5vw, 3rem)' }}>
        <h1 className="h1">MediCard</h1>
        <p className="muted" style={{ maxWidth: '46rem' }}>
          An emergency medical information wallet. Keep allergies, medications, conditions and
          emergency contacts in one place, and share them with a rescuer through a revocable QR
          code when seconds matter.
        </p>

        <div className="row" style={{ marginTop: '1.5rem' }}>
          {status === 'signedIn' ? (
            <Link className="btn btn-primary" to="/dashboard">
              Open my dashboard
            </Link>
          ) : (
            <>
              <Link className="btn btn-primary" to="/register">
                Create an account
              </Link>
              <Link className="btn btn-secondary" to="/login">
                Sign in
              </Link>
            </>
          )}
        </div>

        <div className="safety-note" style={{ marginTop: '2rem' }}>
          <strong>Not medical advice.</strong> MediCard only relays information you enter. It
          does not diagnose, triage, or recommend treatment, and it is not a substitute for
          professional care. In an emergency, call your local emergency number first.
        </div>
      </section>
    </div>
  )
}
