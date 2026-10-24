import { describe, expect, it } from 'vitest'
import {
  emailSchema,
  fieldErrors,
  MIN_PASSWORD_LENGTH,
  registerSchema,
  signInSchema,
} from './schemas'

describe('emailSchema', () => {
  it('accepts a normal address and trims whitespace', () => {
    expect(emailSchema.safeParse('  patient@example.com ').success).toBe(true)
  })

  it.each(['', 'not-an-email', 'a@b', 'patient@', '@example.com', `a${'b'.repeat(250)}@x.co`])(
    'rejects %j',
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe('signInSchema', () => {
  it('requires both fields', () => {
    const result = signInSchema.safeParse({ email: '', password: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = fieldErrors(result.error)
      expect(errors.email).toBeTruthy()
      expect(errors.password).toBeTruthy()
    }
  })

  it('does not impose password rules at sign-in', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
  })
})

describe('registerSchema', () => {
  const valid = {
    fullName: 'Test Patient',
    email: 'patient@example.com',
    password: 'correct horse battery staple',
    confirmPassword: 'correct horse battery staple',
  }

  it('accepts a valid payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true)
  })

  it(`requires at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    const result = registerSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).password).toMatch(/12/)
  })

  it('rejects mismatched passwords', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'different value here' })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).confirmPassword).toMatch(/do not match/i)
  })

  it('rejects a single repeated character', () => {
    const password = 'aaaaaaaaaaaaaaaa'
    const result = registerSchema.safeParse({ ...valid, password, confirmPassword: password })
    expect(result.success).toBe(false)
  })

  it('trims the full name', () => {
    const result = registerSchema.safeParse({ ...valid, fullName: '  Test Patient  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.fullName).toBe('Test Patient')
  })

  it('reports only the first error per field', () => {
    const result = registerSchema.safeParse({ ...valid, email: 'nope' })
    if (!result.success) {
      const errors = fieldErrors(result.error)
      expect(Object.keys(errors)).toEqual(['email'])
    }
  })
})
