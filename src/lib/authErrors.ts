/**
 * Turns Supabase/auth failures into safe, actionable copy.
 *
 * Rules:
 * - Never surface raw provider messages: they can contain internals and they
 *   read like stack traces to a patient in a hurry.
 * - Never reveal whether an email is registered during sign-in. A generic
 *   "email or password is incorrect" keeps user enumeration off the table.
 */

interface SupabaseAuthErrorLike {
  message?: string
  code?: string
  status?: number
}

function asAuthError(error: unknown): SupabaseAuthErrorLike | null {
  if (typeof error !== 'object' || error === null) return null
  return error as SupabaseAuthErrorLike
}

export function isNetworkError(error: unknown): boolean {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''
  return /fetch|network|failed to fetch|load failed/i.test(message)
}

/** User-facing message for a failed sign-in attempt. */
export function signInErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Unable to reach the server. Check your connection and try again.'
  }

  const authError = asAuthError(error)
  const message = (authError?.message ?? '').toLowerCase()

  if (message.includes('invalid login credentials')) {
    return 'Email or password is incorrect.'
  }
  if (message.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.'
  }
  if (authError?.status === 429 || message.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.'
  }

  return 'Unable to sign you in. Please try again.'
}

/** User-facing message for a failed registration. */
export function signUpErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Unable to reach the server. Check your connection and try again.'
  }

  const authError = asAuthError(error)
  const message = (authError?.message ?? '').toLowerCase()

  if (message.includes('already registered') || message.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (authError?.status === 429 || message.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (message.includes('password')) {
    return 'That password does not meet the requirements. Please choose a stronger one.'
  }
  if (message.includes('valid email')) {
    return 'Please enter a valid email address.'
  }

  return 'Unable to create your account. Please try again.'
}

/** Generic fallback for non-auth operations. */
export function operationErrorMessage(error: unknown, fallback: string): string {
  if (isNetworkError(error)) {
    return 'Unable to reach the server. Check your connection and try again.'
  }
  const authError = asAuthError(error)
  const message = (authError?.message ?? '').toLowerCase()
  if (authError?.status === 429 || message.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.'
  }
  if (message.includes('row-level security')) {
    return 'You do not have permission to do that.'
  }
  return fallback
}
