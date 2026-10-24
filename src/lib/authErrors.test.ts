import { describe, expect, it } from 'vitest'
import { isNetworkError, operationErrorMessage, signInErrorMessage, signUpErrorMessage } from './authErrors'

describe('signInErrorMessage', () => {
  it('does not reveal whether an email exists', () => {
    const message = signInErrorMessage({ message: 'Invalid login credentials', status: 400 })
    expect(message).toBe('Email or password is incorrect.')
    expect(message).not.toMatch(/no user|not found|unknown/i)
  })

  it('never echoes the provider message', () => {
    const message = signInErrorMessage({
      message: 'Database error: relation "auth.users" missing',
      status: 500,
    })
    expect(message).not.toContain('relation')
    expect(message).not.toContain('auth.users')
    expect(message).toBe('Unable to sign you in. Please try again.')
  })

  it('maps unconfirmed email', () => {
    expect(signInErrorMessage({ message: 'Email not confirmed' })).toBe(
      'Please confirm your email address before signing in.',
    )
  })

  it('maps rate limiting', () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/too many attempts/i)
  })

  it('maps network failure distinctly', () => {
    const message = signInErrorMessage(new TypeError('Failed to fetch'))
    expect(message).toMatch(/unable to reach the server/i)
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('handles non-object errors without throwing', () => {
    expect(signInErrorMessage(undefined)).toBeTruthy()
    expect(signInErrorMessage(null)).toBeTruthy()
    expect(signInErrorMessage('boom')).toBeTruthy()
  })
})

describe('signUpErrorMessage', () => {
  it('reports an existing account', () => {
    expect(signUpErrorMessage({ message: 'User already registered' })).toMatch(
      /already exists/i,
    )
  })

  it('does not leak internals for unknown errors', () => {
    const message = signUpErrorMessage({ message: 'internal stack at line 42', status: 500 })
    expect(message).toBe('Unable to create your account. Please try again.')
  })
})

describe('operationErrorMessage', () => {
  it('uses the caller fallback for unknown errors', () => {
    expect(operationErrorMessage({ message: 'nope' }, 'Could not save.')).toBe('Could not save.')
  })

  it('translates permission failures', () => {
    expect(operationErrorMessage({ message: 'row-level security policy violation' }, 'x')).toMatch(
      /do not have permission/i,
    )
  })
})
