import { z } from 'zod'

/**
 * Client-side validation schemas.
 *
 * These run before any network call so the user gets instant feedback, and
 * they are intentionally strict. Server-side, RLS and Postgres CHECK
 * constraints are the real boundary - client validation is a usability layer,
 * never a security control.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.')

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
})

export const MIN_PASSWORD_LENGTH = 12

export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(128, 'Passwords are limited to 128 characters.')
  .refine((value) => !/^\s+$/.test(value), 'Password cannot be only spaces.')
  .refine(
    (value) => !/^(.)\1+$/.test(value),
    'Password cannot be a single repeated character.',
  )

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name.')
  .max(120, 'Name is limited to 120 characters.')

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export type SignInValues = z.infer<typeof signInSchema>
export type RegisterValues = z.infer<typeof registerSchema>

/** Maps a ZodError to a field -> message record for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!errors[key]) errors[key] = issue.message
  }
  return errors
}
