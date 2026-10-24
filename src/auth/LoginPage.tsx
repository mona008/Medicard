import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { fieldErrors, signInSchema } from './schemas'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

export function LoginPage() {
  const { signIn } = useAuth()
  const location = useLocation()

  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const parsed = signInSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSubmitting(true)
    try {
      const result = await signIn(parsed.data.email, parsed.data.password)
      if (result.error) {
        setFormError(result.error)
        setValues((current) => ({ ...current, password: '' }))
      }
      // On success the auth state flips and <GuestOnly> redirects to `from`.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container narrow section">
      <div className="card">
        <h1 className="h1">Sign in</h1>
        <p className="muted">
          Access your medical profile and emergency card
          {from ? ' to continue to the page you requested.' : '.'}
        </p>

        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={values.email}
            error={errors.email}
            onChange={(event) => setValues({ ...values, email: event.target.value })}
          />

          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={values.password}
            error={errors.password}
            onChange={(event) => setValues({ ...values, password: event.target.value })}
          />

          <Button type="submit" loading={submitting} className="btn-block">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="small" style={{ marginTop: '1.25rem' }}>
          New to MediCard? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
