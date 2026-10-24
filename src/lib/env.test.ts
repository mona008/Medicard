import { describe, expect, it } from 'vitest'
import { describeIssues, readSupabaseConfig, type EnvSource } from './env'

const VALID: EnvSource = {
  VITE_SUPABASE_URL: 'https://abcdefg.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload',
}

describe('readSupabaseConfig', () => {
  it('accepts a well-formed configuration', () => {
    const result = readSupabaseConfig(VALID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.url).toBe('https://abcdefg.supabase.co')
      expect(result.config.anonKey).toBe(VALID.VITE_SUPABASE_ANON_KEY)
    }
  })

  it('strips trailing slashes from the URL', () => {
    const result = readSupabaseConfig({ ...VALID, VITE_SUPABASE_URL: 'https://x.supabase.co/' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.config.url).toBe('https://x.supabase.co')
  })

  it('reports every missing variable at once', () => {
    const result = readSupabaseConfig({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toEqual(['missing-url', 'missing-anon-key'])
  })

  it('treats the .env.example placeholders as unconfigured', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toEqual(['missing-url', 'missing-anon-key'])
  })

  it('rejects a malformed URL', () => {
    const result = readSupabaseConfig({ ...VALID, VITE_SUPABASE_URL: 'not a url' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContain('invalid-url')
  })

  it('rejects a non-http protocol', () => {
    const result = readSupabaseConfig({ ...VALID, VITE_SUPABASE_URL: 'javascript:alert(1)' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContain('invalid-url')
  })

  it('rejects a suspiciously short anon key', () => {
    const result = readSupabaseConfig({ ...VALID, VITE_SUPABASE_ANON_KEY: 'short' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toEqual(['short-anon-key'])
  })
})

describe('describeIssues', () => {
  it('names variables but never echoes their values', () => {
    const secret = 'sk-super-secret-value-do-not-leak'
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: `not a url ${secret}`,
      VITE_SUPABASE_ANON_KEY: secret,
    })

    expect(result.ok).toBe(false)
    const messages = describeIssues(result.ok ? [] : result.issues).join(' ')

    // The variable NAME is reported; the VALUE never is.
    expect(messages).toContain('VITE_SUPABASE_URL')
    expect(messages).not.toContain(secret)
    expect(messages).not.toContain('sk-super')
    expect(messages).not.toContain('not a url')
  })
})
