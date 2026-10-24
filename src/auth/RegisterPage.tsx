import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { fieldErrors, MIN_PASSWORD_LENGTH, registerSchema } from './schemas'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

export function RegisterPage() {
  const { signUp } = useAuth()

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const parsed = registerSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSubmitting(true)
    try {
      const result = await signUp(
        parsed.data.email,
        parsed.data.password,
        parsed.data.fullName,
      )

      if (result.error) {
        setFormError(result.error)
        setValues((current) => ({ ...current, password: '', confirmPassword: '' }))
        return
      }

      if (result.needsConfirmation) setConfirmationSent(true)
      // Otherwise Supabase signed the user in and <GuestOnly> redirects.
    } finally {
      setSubmitting(false)
    }
  }

  if (confirmationSent) {
    return (
      <div className="container narrow section">
        <div className="card">
          <h1 className="h1">Check your email</h1>
          <Alert tone="success">
            We sent a confirmation link to <strong>{values.email}</strong>. Open it to activate
            your account, then sign in.
          </Alert>
          <p className="small muted">
            The link may take a minute to arrive. Check your spam folder if you do not see it.
          </p>
          <Link className="btn btn-secondary" to="/login">
            Go to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container narrow section">
      <div className="card">
        <h1 className="h1">Create your account</h1>
        <p className="muted">
          You must be the patient, or authorized to manage their record, to create an account.
        </p>

        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Full name"
            name="fullName"
            autoComplete="name"
            required
            value={values.fullName}
            error={errors.fullName}
            onChange={(event) => setValues({ ...values, fullName: event.target.value })}
          />

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
            autoComplete="new-password"
            required
            hint={`At least ${MIN_PASSWORD_LENGTH} characters. A longer passphrase is easiest to remember.`}
            value={values.password}
            error={errors.password}
            onChange={(event) => setValues({ ...values, password: event.target.value })}
          />

          <TextField
            label="Confirm password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={values.confirmPassword}
            error={errors.confirmPassword}
            onChange={(event) => setValues({ ...values, confirmPassword: event.target.value })}
          />

          <Button type="submit" loading={submitting} className="btn-block">
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <div className="safety-note small" style={{ marginTop: '1.25rem' }}>
          <strong>Development reminder:</strong> never enter real patient medical information
          while testing. Use synthetic data only.
        </div>

        <p className="small" style={{ marginTop: '1rem' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
